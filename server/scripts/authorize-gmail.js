import { authorizeGmail, getGmailPaths } from "../services/gmailAuth.js";

try {
  await authorizeGmail({ interactive: true });
  const { tokenPath } = getGmailPaths();
  console.log(`Gmail authorization saved to ${tokenPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
