// Canonical, backend-owned snapshots of the exact checkout consent copy — kept
// in sync with the frontend's `parentBookings.consentBlock.*` translation keys
// (the-sage-nest-frontend/src/i18n/locales/{en,it}/parentBookings.json).
// Plain text, with any embedded link labels spelled out inline, matching what
// the wording looks like once rendered on the page. Snapshotted verbatim into
// BookingConsent at booking time so the audit trail survives future copy edits.

const WORDING = {
  en: {
    terms: "I have read and accept the Consumer Terms and the Cancellation and Rescheduling Policy.",
    withdrawal: "I expressly request that my Session take place before the end of the 14-day cooling-off (withdrawal) period, and I understand that my right of withdrawal ends once the Session has been fully delivered.",
    withdrawalExpander: "EU law gives you 14 days to change your mind about online purchases. Because your Session may happen within those 14 days, we ask you to confirm you'd like to go ahead — your options under our Cancellation and Rescheduling Policy are not affected.",
  },
  it: {
    terms: "Ho letto e accetto i Termini di Consumo e le Condizioni di Cancellazione e Modifica della Prenotazione.",
    withdrawal: "Richiedo espressamente che la mia Sessione si svolga prima della scadenza del periodo di recesso di 14 giorni e sono consapevole che il diritto di recesso si perde una volta che la Sessione si è svolta per intero.",
    withdrawalExpander: "La legge europea ti riconosce 14 giorni per cambiare idea sugli acquisti online. Poiché la tua Sessione potrebbe svolgersi entro questi 14 giorni, ti chiediamo di confermare che desideri che abbia luogo — le tue possibilità di cancellazione e modifica previste dalle nostre condizioni restano invariate.",
  },
};

function getConsentWording(language) {
  return WORDING[language] || WORDING.en;
}

module.exports = { getConsentWording };
