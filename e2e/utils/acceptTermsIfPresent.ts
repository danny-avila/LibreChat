
export async function acceptTermsIfPresent(page) {
  // Clear the flag so that the modal is forced to appear on every request.
  await page.evaluate(() => localStorage.removeItem('termsAccepted'));

  try {
    // Get the "i accept" button using an accessible role and regex.
    const acceptButton = page.getByRole('button', { name: /i accept/i });
    // Wait for the button to become visible.
    await acceptButton.waitFor({ state: 'visible', timeout: 10000 });
    // Click the button.
    await acceptButton.click();
    // Wait for the button to be hidden (indicating the modal closed).
    await acceptButton.waitFor({ state: 'hidden', timeout: 10000 });
  } catch (error) {
    console.log('Terms & Conditions modal did not appear: ', error);
  }
}