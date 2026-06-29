const BREVO_API_BASE = 'https://api.brevo.com/v3';

const brevoHeaders = () => ({
  accept: 'application/json',
  'content-type': 'application/json',
  'api-key': process.env.BREVO_API_KEY,
});

const splitName = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
};

/**
 * Upsert a parent as a Brevo contact.
 * If BREVO_PARENTS_LIST_ID is set, adds them to that list.
 * Stores MARKETING_CONSENT as a Brevo attribute so campaigns can filter on it.
 * Never throws — logs and returns so callers are never blocked.
 *
 * @param {{ email: string, name: string, phone?: string|null, marketingConsent?: boolean }} param0
 */
const addOrUpdateBrevoContact = async ({ email, name, marketingConsent = false }) => {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[Brevo] BREVO_API_KEY not set — skipping contact sync');
    return;
  }

  const { firstName, lastName } = splitName(name);
  const listId = process.env.BREVO_PARENTS_LIST_ID ? Number(process.env.BREVO_PARENTS_LIST_ID) : null;

  const body = {
    email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: firstName,
      LASTNAME: lastName,
      MARKETING_CONSENT: marketingConsent,
    },
    ...(listId ? { listIds: [listId] } : {}),
  };

  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: brevoHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Brevo] Contact upsert failed for ${email}: ${res.status} ${text}`);
    }
  } catch (err) {
    console.error(`[Brevo] Contact upsert error for ${email}: ${err.message}`);
  }
};

/**
 * Remove a contact from the parents marketing list (e.g., on marketing consent withdrawal).
 * Does NOT delete the contact from Brevo.
 *
 * @param {string} email
 */
const removeBrevoContactFromList = async (email) => {
  const listId = process.env.BREVO_PARENTS_LIST_ID ? Number(process.env.BREVO_PARENTS_LIST_ID) : null;
  if (!process.env.BREVO_API_KEY || !listId) return;

  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/remove`, {
      method: 'POST',
      headers: brevoHeaders(),
      body: JSON.stringify({ emails: [email] }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Brevo] Remove from list failed for ${email}: ${res.status} ${text}`);
    }
  } catch (err) {
    console.error(`[Brevo] Remove from list error for ${email}: ${err.message}`);
  }
};

module.exports = { addOrUpdateBrevoContact, removeBrevoContactFromList };
