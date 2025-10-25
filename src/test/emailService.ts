export const sendVerificationEmail = async (email: string, token?: string, firstName?: string) => {
  return { success: true, messageId: 'test-message-id', email, token, firstName };
};

export const sendResetEmail = async (email: string, code?: string) => {
  return { success: true, messageId: 'test-reset-id', email, code };
};

export default { sendVerificationEmail, sendResetEmail };