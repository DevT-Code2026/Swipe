const { test, expect } = require('@playwright/test');

function uniqueId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSvg(label) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <rect width="1200" height="1200" fill="#101014"/>
      <rect x="90" y="90" width="1020" height="1020" rx="56" fill="#1a1a20" stroke="#e8ff47" stroke-width="12"/>
      <circle cx="270" cy="310" r="110" fill="#3dff8f"/>
      <circle cx="870" cy="340" r="150" fill="#ff4d6d" opacity="0.88"/>
      <rect x="180" y="640" width="840" height="180" rx="28" fill="#26262f"/>
      <text x="600" y="560" text-anchor="middle" fill="#f7f7fa" font-size="86" font-family="Arial, sans-serif" font-weight="700">${label}</text>
      <text x="600" y="740" text-anchor="middle" fill="#e8ff47" font-size="58" font-family="Arial, sans-serif">CreativeSwipe Smoke</text>
    </svg>`
  );
}

async function registerSender(request, baseURL, sender) {
  const response = await request.post(`${baseURL}/api/auth/register`, {
    data: {
      email: sender.email,
      password: sender.password,
      name: sender.name,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createSession(request, baseURL, creatorToken, details) {
  const response = await request.post(`${baseURL}/api/sessions`, {
    headers: {
      Authorization: `Bearer ${creatorToken}`,
    },
    data: details,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function uploadSessionAsset(request, baseURL, creatorToken, sessionId, label) {
  const response = await request.post(`${baseURL}/api/sessions/${sessionId}/images`, {
    headers: {
      Authorization: `Bearer ${creatorToken}`,
    },
    multipart: {
      file: {
        name: 'smoke.svg',
        mimeType: 'image/svg+xml',
        buffer: buildSvg(label),
      },
      fileName: 'smoke.svg',
      contentType: 'image/svg+xml',
      templateChannel: 'instagram',
      templateText: `Smoke caption ${label}`,
      rowId: `row-${label}`,
      rowOrder: '1',
    },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe.serial('CreativeSwipe smoke', () => {
  test('different sender and receiver emails connect through review flow and receiver login works', async ({ page, request, baseURL }) => {
    const id = uniqueId();
    const sender = {
      name: `Smoke Sender ${id}`,
      email: `sender.${id}@example.com`,
      password: 'SmokePass123!',
    };
    const receiver = {
      name: `Smoke Receiver ${id}`,
      email: `receiver.${id}@example.com`,
      password: 'SmokePass123!',
    };
    const clientName = `Smoke Client ${id}`;
    const projectName = `Smoke Project ${id}`;
    let sessionId = null;
    let creatorToken = null;

    try {
      const senderAuth = await registerSender(request, baseURL, sender);
      creatorToken = senderAuth.token;

      const sessionPayload = await createSession(request, baseURL, creatorToken, {
        title: `${clientName} - ${projectName}`,
        clientName,
        projectName,
        maxReviewers: 25,
      });
      sessionId = sessionPayload.session.id;

      await uploadSessionAsset(request, baseURL, creatorToken, sessionId, `SMOKE-${id}`);

      await page.goto(`${baseURL}${sessionPayload.reviewLink}`);
      await expect(page.getByRole('button', { name: 'Start Reviewing' })).toBeVisible();

      await page.getByPlaceholder('Enter your name').fill(receiver.name);
      await page.getByPlaceholder('you@company.com').fill(receiver.email);
      await page.getByRole('button', { name: 'Start Reviewing' }).click();

      await expect(page).toHaveURL(new RegExp(`/r/${sessionId}/review$`));
      await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

      await page.getByRole('button', { name: 'Approve' }).click();
      await expect(page.getByRole('button', { name: 'Submit Review' })).toBeVisible();
      await page.getByRole('button', { name: 'Submit Review' }).click();

      await expect(page).toHaveURL(new RegExp(`/r/${sessionId}/complete$`));
      await page.getByRole('button', { name: 'View Dashboard' }).click();

      await expect(page).toHaveURL(new RegExp('/reviewer/login$'));
      await expect(page.getByRole('heading', { name: 'Create Receiver Account' })).toBeVisible();
      await expect(page.getByPlaceholder('Your name')).toHaveValue(receiver.name);
      await expect(page.getByPlaceholder('you@company.com')).toHaveValue(receiver.email);

      await page.getByPlaceholder('Enter your password').fill(receiver.password);
      await page.getByRole('button', { name: 'Create Account' }).click();

      await expect(page).toHaveURL(new RegExp('/reviewer$'));
      await expect(page.getByText(projectName)).toBeVisible();
      await expect(
        page.getByText(new RegExp(`^Reviewer:\\s*${escapeForRegex(receiver.name)}$`))
      ).toBeVisible();

      await page.getByRole('button', { name: 'Logout' }).click();
      await expect(page).toHaveURL(new RegExp('/reviewer/login$'));

      await page.getByPlaceholder('you@company.com').fill(receiver.email);
      await page.getByPlaceholder('Enter your password').fill(receiver.password);
      await page.getByRole('button', { name: 'Open Receiver Dashboard' }).click();

      await expect(page).toHaveURL(new RegExp('/reviewer$'));
      await expect(page.getByText(projectName)).toBeVisible();
      await expect(
        page.getByText(new RegExp(`^Reviewer:\\s*${escapeForRegex(receiver.name)}$`))
      ).toBeVisible();

      await page.getByText(projectName).click();
      await expect(page).toHaveURL(new RegExp(`/reviewer/sessions/${sessionId}/history$`));
      await expect(page.getByText('Decisions Given')).toBeVisible();
      await expect(page.getByText('smoke.svg')).toBeVisible();

      await page.goto(`${baseURL}/reviewer`);
      await page.getByRole('button', { name: 'Logout' }).click();
      await expect(page).toHaveURL(new RegExp('/reviewer/login$'));

      await page.goto(`${baseURL}/login`);
      await page.getByPlaceholder('you@company.com').fill(receiver.email);
      await page.getByPlaceholder('Enter your password').fill(receiver.password);
      await page.getByRole('button', { name: 'Sign In' }).click();

      await expect(page).toHaveURL(new RegExp('/reviewer$'));
      await expect(
        page.getByText(new RegExp(`^Reviewer:\\s*${escapeForRegex(receiver.name)}$`))
      ).toBeVisible();
    } finally {
      if (creatorToken && sessionId) {
        await request.delete(`${baseURL}/api/sessions/${sessionId}`, {
          headers: {
            Authorization: `Bearer ${creatorToken}`,
          },
        });
      }
    }
  });
});
