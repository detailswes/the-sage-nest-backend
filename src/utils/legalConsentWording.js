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
//
// withdrawal/withdrawalExpander below are the booking flow spec v1.7 §11.4
// wording — shorter than the previous variant it replaced (§5.3: "the live
// build uses a longer sentence... replace it, do not keep both variants").
//
// healthConsentFlowA/healthConsentFlowB are v1.7 §11.3 ("Final. Do not
// paraphrase, shorten or split.") — exactly one renders per booking, chosen
// by the service's recipient (For the Parents → A, For the Baby → B, unset →
// A), gated on the expert's admin-set health-professional flag. Independent
// of the withdrawal consent above — neither triggers nor suppresses the other.

const WORDING = {
  en: {
    terms: "I have read and accept the Consumer Terms and the Cancellation and Rescheduling Policy.",
    withdrawal: "The session is booked within the next 14 days. I ask that it goes ahead on the date I chose, before the withdrawal period ends, and accept that I lose the right of withdrawal once the session has taken place.",
    withdrawalExpander: "By law you have 14 days from confirming a booking to change your mind and get a refund. Your chosen date falls inside those 14 days, so we need you to confirm you still want it. Nothing changes about your session time. Once it has taken place, the 14-day right no longer applies.",
    withdrawalConfirmedEmail: "When you completed your booking, your session was within the next 14 days. You asked for it to go ahead on the date you chose, before the withdrawal period ended, and accepted that you would lose the right of withdrawal once the session had taken place.",
    withdrawalInstructionsEmail: "If your session has not yet taken place, you may still withdraw from the contract within 14 days of booking. To do so, follow the instructions in Clause 8 (Right of Withdrawal) of our {TERMS_LINK}, where you will also find the model withdrawal form. If you withdraw after performance has begun but before the session has been fully performed, you may be charged a proportionate amount for the part already provided.",
    withdrawalPlainEmail: "You may withdraw from this contract within 14 days of booking, without giving any reason and at no cost. To do so, follow the instructions in Clause 8 (Right of Withdrawal) of our {TERMS_LINK}, where you will also find the model withdrawal form. After the 14-day period, the Cancellation & Rescheduling Policy below applies.",
    healthConsentFlowA: {
      label: "Consent to processing",
      body: "I expressly consent to Sage Nest processing my health-related booking data to manage my appointment, scheduling, appointment communications, and related payments. I understand that I can withdraw my consent at any time.",
      helper: "You can withdraw your consent at any time by writing to hello@sagenest.org. Withdrawing before the session cancels the booking. It does not delete invoicing and tax records we are required to keep.",
    },
    healthConsentFlowB: {
      label: "Consent to processing",
      body: "I confirm that I hold parental responsibility for the child who is the recipient of this booking, and I expressly consent on the child's behalf to Sage Nest processing the child's health-related booking data to manage the child's appointment, scheduling, appointment communications, and related payments. I understand that I can withdraw this consent at any time.",
      helper: "You can withdraw your consent at any time by writing to hello@sagenest.org. Withdrawing before the session cancels the booking. It does not delete invoicing and tax records we are required to keep.",
    },
  },
  it: {
    terms: "Ho letto e accetto i Termini di Consumo e le Condizioni di Cancellazione e Modifica della Prenotazione.",
    withdrawal: "La sessione è prenotata entro i prossimi 14 giorni. Chiedo che si svolga alla data scelta, prima della scadenza del periodo di recesso, e accetto di perdere il diritto di recesso una volta che la sessione è stata erogata.",
    withdrawalExpander: "Per legge hai 14 giorni dalla conferma per cambiare idea e ottenere il rimborso. La data che hai scelto rientra in questi 14 giorni, quindi ci serve la tua conferma. L'orario della sessione non cambia. Una volta svolta, il diritto di recesso non si applica più.",
    withdrawalConfirmedEmail: "Al momento della prenotazione, la tua sessione era prevista entro i 14 giorni successivi. Hai chiesto che si svolgesse alla data scelta, prima della scadenza del periodo di recesso, e hai accettato di perdere il diritto di recesso una volta che la sessione si fosse svolta.",
    withdrawalInstructionsEmail: "Se la tua Sessione non si è ancora svolta, puoi comunque recedere dal contratto entro 14 giorni dalla prenotazione. Per farlo, segui le istruzioni nell'Articolo 8 (Diritto di recesso) dei nostri {TERMS_LINK}, dove troverai anche il modulo tipo di recesso. Se recedi dopo che la Sessione è iniziata, ma prima che si sia svolta per intero, potrà esserti addebitato un importo proporzionale al servizio già ricevuto.",
    withdrawalPlainEmail: "Puoi recedere dal presente contratto entro 14 giorni dalla prenotazione, senza fornire alcuna motivazione e senza alcun costo. Per farlo, segui le istruzioni nell'Articolo 8 (Diritto di recesso) dei nostri {TERMS_LINK}, dove troverai anche il modulo tipo di recesso. Trascorso il periodo di 14 giorni, si applicano le Condizioni di Cancellazione e Modifica della Prenotazione riportate di seguito.",
    healthConsentFlowA: {
      label: "Consenso al trattamento",
      body: "Acconsento espressamente al trattamento da parte di Sage Nest dei dati sanitari relativi alla mia prenotazione, per gestire l'appuntamento, la programmazione, le comunicazioni relative all'appuntamento e i relativi pagamenti. Ho compreso di poter revocare il consenso in qualsiasi momento.",
      helper: "Puoi revocare il consenso in qualsiasi momento scrivendo a hello@sagenest.org. La revoca prima della sessione comporta la cancellazione della prenotazione. Non elimina i documenti fiscali e contabili che siamo tenuti a conservare.",
    },
    healthConsentFlowB: {
      label: "Consenso al trattamento",
      body: "Dichiaro di esercitare la responsabilità genitoriale sul minore destinatario di questa prenotazione e acconsento espressamente, per suo conto, al trattamento da parte di Sage Nest dei dati sanitari relativi alla prenotazione del minore, per gestire l'appuntamento, la programmazione, le comunicazioni relative all'appuntamento e i relativi pagamenti. Ho compreso di poter revocare questo consenso in qualsiasi momento.",
      helper: "Puoi revocare il consenso in qualsiasi momento scrivendo a hello@sagenest.org. La revoca prima della sessione comporta la cancellazione della prenotazione. Non elimina i documenti fiscali e contabili che siamo tenuti a conservare.",
    },
  },
};

// Bumped only if the health-consent copy above changes — independent of
// tc_version/withdrawal (which have their own versioning via LegalDocument).
const HEALTH_CONSENT_VERSION = "v1";

function getConsentWording(language) {
  return WORDING[language] || WORDING.en;
}

// flow: "A" | "B"
function getHealthConsentWording(language, flow) {
  const dict = WORDING[language] || WORDING.en;
  return flow === "B" ? dict.healthConsentFlowB : dict.healthConsentFlowA;
}

module.exports = { getConsentWording, getHealthConsentWording, HEALTH_CONSENT_VERSION };
