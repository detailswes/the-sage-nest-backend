// Canonical, backend-owned snapshots of the exact checkout consent copy — kept
// in sync with the frontend's `parentBookings.consentBlock.*` translation keys
// (the-sage-nest-frontend/src/i18n/locales/{en,it}/parentBookings.json).
// Plain text, with any embedded link labels spelled out inline, matching what
// the wording looks like once rendered on the page. Snapshotted verbatim into
// BookingConsent at booking time so the audit trail survives future copy edits.
//
// withdrawalConfirmedEmail/withdrawalInstructionsEmail/withdrawalPlainEmail are
// the booking-confirmation-email counterparts (Appendix C, consent spec for
// Chahat, 15 July 2026) — withdrawalConfirmedEmail mirrors `withdrawal` above,
// adapted to past tense, so if the checkbox copy changes this sentence must
// change with it. `{TERMS_LINK}` is replaced with an <a> to the live Consumer
// Terms PDF for the email's language.

const WORDING = {
  en: {
    terms: "I have read and accept the Consumer Terms and the Cancellation and Rescheduling Policy.",
    withdrawal: "I expressly request that my Session take place before the end of the 14-day cooling-off (withdrawal) period, and I understand that my right of withdrawal ends once the Session has been fully delivered.",
    withdrawalExpander: "EU law gives you 14 days to change your mind about online purchases. Because your Session may happen within those 14 days, we ask you to confirm you'd like to go ahead — your options under our Cancellation and Rescheduling Policy are not affected.",
    withdrawalConfirmedEmail: "When you completed your booking, you expressly requested that your Session take place before the end of the 14-day cooling-off (withdrawal) period, and confirmed you understand that your right of withdrawal ends once the Session has been fully delivered.",
    withdrawalInstructionsEmail: "If your session has not yet taken place, you may still withdraw from the contract within 14 days of booking. To do so, follow the instructions in Clause 8 (Right of Withdrawal) of our {TERMS_LINK}, where you will also find the model withdrawal form. If you withdraw after performance has begun but before the session has been fully performed, you may be charged a proportionate amount for the part already provided.",
    withdrawalPlainEmail: "You may withdraw from this contract within 14 days of booking, without giving any reason and at no cost. To do so, follow the instructions in Clause 8 (Right of Withdrawal) of our {TERMS_LINK}, where you will also find the model withdrawal form. After the 14-day period, the Cancellation & Rescheduling Policy below applies.",
  },
  it: {
    terms: "Ho letto e accetto i Termini di Consumo e le Condizioni di Cancellazione e Modifica della Prenotazione.",
    withdrawal: "Richiedo espressamente che la mia Sessione si svolga prima della scadenza del periodo di recesso di 14 giorni e sono consapevole che il diritto di recesso si perde una volta che la Sessione si è svolta per intero.",
    withdrawalExpander: "La legge europea ti riconosce 14 giorni per cambiare idea sugli acquisti online. Poiché la tua Sessione potrebbe svolgersi entro questi 14 giorni, ti chiediamo di confermare che desideri che abbia luogo — le tue possibilità di cancellazione e modifica previste dalle nostre condizioni restano invariate.",
    withdrawalConfirmedEmail: "Al momento della prenotazione hai richiesto espressamente che la tua Sessione si svolgesse prima della scadenza del periodo di recesso di 14 giorni, confermando di essere consapevole che il diritto di recesso si perde una volta che la Sessione si è svolta per intero.",
    withdrawalInstructionsEmail: "Se la tua Sessione non si è ancora svolta, puoi comunque recedere dal contratto entro 14 giorni dalla prenotazione. Per farlo, segui le istruzioni nell'Articolo 8 (Diritto di recesso) dei nostri {TERMS_LINK}, dove troverai anche il modulo tipo di recesso. Se recedi dopo che la Sessione è iniziata, ma prima che si sia svolta per intero, potrà esserti addebitato un importo proporzionale al servizio già ricevuto.",
    withdrawalPlainEmail: "Puoi recedere dal presente contratto entro 14 giorni dalla prenotazione, senza fornire alcuna motivazione e senza alcun costo. Per farlo, segui le istruzioni nell'Articolo 8 (Diritto di recesso) dei nostri {TERMS_LINK}, dove troverai anche il modulo tipo di recesso. Trascorso il periodo di 14 giorni, si applicano le Condizioni di Cancellazione e Modifica della Prenotazione riportate di seguito.",
  },
};

function getConsentWording(language) {
  return WORDING[language] || WORDING.en;
}

module.exports = { getConsentWording };
