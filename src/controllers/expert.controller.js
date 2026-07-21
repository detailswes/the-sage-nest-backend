const prisma = require('../prisma/client');
const { encryptIban, decryptIban } = require('../utils/encryption');
const { uploadFile, deleteFile } = require('../utils/storage');
const { syncExpert } = require('../services/webflow.service');

const VALID_SESSION_FORMATS = ['ONLINE', 'IN_PERSON', 'BOTH'];

// Fire-and-forget audit entry written on behalf of an expert (not an admin).
// admin_id stores the expert's user_id — the User record exists so the name
// resolves correctly in getAuditLog without any schema changes.
async function logExpertEvent(userId, action, expertId, note = null) {
  try {
    await prisma.adminAuditLog.create({
      data: { admin_id: userId, action, entity_type: 'EXPERT', entity_id: expertId, note },
    });
  } catch { /* non-fatal */ }
}

function isValidTimezone(tz) {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
  catch { return false; }
}

const VALID_QUALIFICATION_TYPES = [
  'LACTATION_CONSULTANT', 'BREASTFEEDING_COUNSELLOR', 'INFANT_SLEEP_CONSULTANT',
  'DOULA', 'MIDWIFE', 'BABY_OSTEOPATH', 'PAEDIATRIC_NUTRITIONIST',
  'EARLY_YEARS_SPECIALIST', 'POSTNATAL_PHYSIOTHERAPIST', 'PARENTING_COACH', 'OTHER',
];

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getMyProfile(req, res) {
  try {
    const expert = await prisma.expert.findUnique({
      where: { user_id: req.user.id },
      include: {
        user: { select: { email: true, created_at: true } },
        qualifications: { orderBy: { created_at: 'asc' } },
        certifications: { orderBy: { created_at: 'asc' } },
        insurance: true,
        business_info: true,
      },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    if (expert.business_info?.iban) {
      expert.business_info.iban = decryptIban(expert.business_info.iban);
    }
    return res.json(expert);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateMyProfile(req, res) {
  const {
    bio, expertise, profile_image,
    summary, position, session_format,
    address_street, address_city, address_postcode,
    languages, pending_languages, timezone,
    instagram, facebook, linkedin,
    buffer_minutes, advance_booking_days, min_notice_hours,
  } = req.body;

  const VALID_SESSION_FORMATS = ['ONLINE', 'IN_PERSON', 'BOTH'];
  if (session_format !== undefined && session_format !== null && session_format !== '') {
    if (!VALID_SESSION_FORMATS.includes(session_format)) {
      return res.status(400).json({ error: 'session_format must be ONLINE, IN_PERSON, or BOTH.' });
    }
  }

  // Practice address is required on all profile saves
  if (address_street !== undefined && !address_street?.trim()) {
    return res.status(400).json({ error: 'Street address is required.' });
  }
  if (address_city !== undefined && !address_city?.trim()) {
    return res.status(400).json({ error: 'City is required.' });
  }
  if (address_postcode !== undefined && !address_postcode?.trim()) {
    return res.status(400).json({ error: 'Postcode is required.' });
  }

  // Validate bio length
  if (bio !== undefined && bio !== null && bio.length > 700) {
    return res.status(400).json({ error: 'Full bio must be 700 characters or fewer.' });
  }

  // Validate summary length
  if (summary !== undefined && summary !== null && summary.length > 300) {
    return res.status(400).json({ error: 'Summary must be 300 characters or fewer.' });
  }

  // Validate timezone (IANA name)
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone value.' });
    }
  }

  // Validate buffer_minutes — must be one of the allowed values
  const VALID_BUFFERS = [0, 15, 30, 45, 60];
  if (buffer_minutes !== undefined) {
    const parsed = parseInt(buffer_minutes, 10);
    if (!VALID_BUFFERS.includes(parsed)) {
      return res.status(400).json({ error: 'buffer_minutes must be one of: 0, 15, 30, 45, 60.' });
    }
  }

  // Validate advance_booking_days — must be one of the allowed values
  const VALID_ADVANCE_DAYS = [14, 30, 60, 90];
  if (advance_booking_days !== undefined) {
    const parsed = parseInt(advance_booking_days, 10);
    if (!VALID_ADVANCE_DAYS.includes(parsed)) {
      return res.status(400).json({ error: 'advance_booking_days must be one of: 14, 30, 60, 90.' });
    }
  }

  // Validate min_notice_hours — must be one of the allowed values
  const VALID_NOTICE_HOURS = [12, 24, 48, 72];
  if (min_notice_hours !== undefined) {
    const parsed = parseInt(min_notice_hours, 10);
    if (!VALID_NOTICE_HOURS.includes(parsed)) {
      return res.status(400).json({ error: 'min_notice_hours must be one of: 12, 24, 48, 72.' });
    }
  }

  // Parse languages — accept JSON array or comma-separated string
  let parsedLanguages;
  if (languages !== undefined) {
    if (Array.isArray(languages)) {
      parsedLanguages = languages.filter(Boolean);
    } else if (typeof languages === 'string' && languages.trim()) {
      try {
        const parsed = JSON.parse(languages);
        parsedLanguages = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        parsedLanguages = languages.split(',').map((l) => l.trim()).filter(Boolean);
      }
    } else {
      parsedLanguages = [];
    }
  }

  // Parse pending_languages — simple array of free-text entries
  let parsedPendingLanguages;
  if (pending_languages !== undefined) {
    parsedPendingLanguages = Array.isArray(pending_languages)
      ? pending_languages.map((l) => l.trim()).filter(Boolean)
      : [];
  }

  try {
    const current = await prisma.expert.findUnique({
      where:  { user_id: req.user.id },
      select: {
        id: true, status: true,
        bio: true, expertise: true, summary: true, position: true,
        session_format: true, address_street: true, address_city: true,
        address_postcode: true, languages: true, timezone: true,
        instagram: true, facebook: true, linkedin: true,
      },
    });
    if (!current) return res.status(404).json({ error: 'Expert profile not found' });

    // ── APPROVED experts: profile content changes go into a pending draft ────────
    // Scheduling/operational settings (buffer_minutes etc.) always go live.
    if (current.status === 'APPROVED') {
      // Build draft data from the profile-content fields only
      const draftData = {
        ...(bio              !== undefined && { bio:              bio              || null }),
        ...(expertise        !== undefined && { expertise:        expertise        || null }),
        ...(summary          !== undefined && { summary:          summary          || null }),
        ...(position         !== undefined && { position:         position         || null }),
        ...(session_format   !== undefined && { session_format:   session_format   || null }),
        ...(address_street   !== undefined && { address_street:   address_street   || null }),
        ...(address_city     !== undefined && { address_city:     address_city     || null }),
        ...(address_postcode !== undefined && { address_postcode: address_postcode || null }),
        ...(parsedLanguages !== undefined && { languages: parsedLanguages }),
        ...(timezone  !== undefined && timezone !== null && timezone !== '' && { timezone }),
        ...(instagram !== undefined && { instagram: instagram || null }),
        ...(facebook  !== undefined && { facebook:  facebook  || null }),
        ...(linkedin  !== undefined && { linkedin:  linkedin  || null }),
      };

      // Only upsert the draft if at least one profile-content field actually changed
      const hasProfileChange = Object.keys(draftData).some((key) => {
        const live = current[key];
        const proposed = draftData[key];
        if (Array.isArray(live) && Array.isArray(proposed)) {
          return JSON.stringify([...live].sort()) !== JSON.stringify([...proposed].sort());
        }
        return live !== proposed;
      });

      // Apply operational/direct-approval fields straight to the live record (bypasses draft review)
      const directUpdate = {
        ...(buffer_minutes       !== undefined && { buffer_minutes:       parseInt(buffer_minutes, 10) }),
        ...(advance_booking_days !== undefined && { advance_booking_days: parseInt(advance_booking_days, 10) }),
        ...(min_notice_hours     !== undefined && { min_notice_hours:     parseInt(min_notice_hours,     10) }),
        // Custom languages have their own per-language approve/reject flow, not the draft review
        ...(parsedPendingLanguages !== undefined && { pending_languages: parsedPendingLanguages }),
      };
      if (Object.keys(directUpdate).length > 0) {
        await prisma.expert.update({ where: { id: current.id }, data: directUpdate });
      }

      if (!hasProfileChange) {
        return res.json({ draft: false });
      }

      const draft = await prisma.expertProfileDraft.upsert({
        where:  { expert_id: current.id },
        create: { expert_id: current.id, ...draftData },
        update: { ...draftData, status: 'PENDING_REVIEW', submitted_at: new Date(), reviewed_at: null, rejection_note: null },
      });

      logExpertEvent(req.user.id, 'EXPERT_PROFILE_DRAFT_SUBMITTED', current.id);
      return res.json({ draft: true, profile_draft: draft });
    }

    // ── Non-APPROVED experts: save directly to live record (existing behaviour) ──
    // If the expert was awaiting changes, saving resets them to PENDING.
    const isResubmission = current.status === 'CHANGES_REQUESTED';
    const statusReset = isResubmission
      ? { status: 'PENDING', change_request_note: null, change_requested_at: null }
      : {};

    const expert = await prisma.expert.update({
      where: { user_id: req.user.id },
      data: {
        ...statusReset,
        ...(bio !== undefined && { bio }),
        ...(expertise !== undefined && { expertise }),
        ...(profile_image !== undefined && { profile_image }),
        ...(summary !== undefined && { summary }),
        ...(position       !== undefined && { position }),
        ...(session_format !== undefined && { session_format: session_format || null }),
        ...(address_street !== undefined && { address_street }),
        ...(address_city !== undefined && { address_city }),
        ...(address_postcode !== undefined && { address_postcode }),
        ...(parsedLanguages !== undefined && { languages: parsedLanguages }),
        ...(parsedPendingLanguages !== undefined && { pending_languages: parsedPendingLanguages }),
        ...(timezone !== undefined && timezone !== null && timezone !== '' && { timezone }),
        ...(instagram !== undefined && { instagram: instagram || null }),
        ...(facebook  !== undefined && { facebook:  facebook  || null }),
        ...(linkedin  !== undefined && { linkedin:  linkedin  || null }),
        ...(buffer_minutes       !== undefined && { buffer_minutes:       parseInt(buffer_minutes, 10) }),
        ...(advance_booking_days !== undefined && { advance_booking_days: parseInt(advance_booking_days, 10) }),
        ...(min_notice_hours     !== undefined && { min_notice_hours:     parseInt(min_notice_hours,     10) }),
      },
    });

    // When profile session_format is locked to ONLINE or IN_PERSON, cascade to
    // all services so they stay in sync. BOTH means the expert controls each
    // service individually, so we leave those untouched.
    if (session_format === 'ONLINE' || session_format === 'IN_PERSON') {
      await prisma.service.updateMany({
        where: { expert_id: current.id },
        data:  { format: session_format },
      });
    }

    logExpertEvent(
      req.user.id,
      isResubmission ? 'EXPERT_PROFILE_RESUBMITTED' : 'EXPERT_PROFILE_SAVED',
      current.id,
    );
    return res.json(expert);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getMyProfileDraft(req, res) {
  try {
    const expert = await prisma.expert.findUnique({
      where:  { user_id: req.user.id },
      select: { id: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const draft = await prisma.expertProfileDraft.findUnique({
      where: { expert_id: expert.id },
    });
    return res.json(draft || null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getExpertById(req, res) {
  const { id } = req.params;

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { name: true, email: true } },
        services: { where: { is_active: true }, orderBy: { sort_order: 'asc' } },
        availability: true,
        qualifications: { orderBy: { created_at: 'asc' } },
        certifications: { orderBy: { created_at: 'asc' } },
        insurance: true,
      },
    });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });
    return res.json(expert);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function uploadProfileImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let newImageUrl = null;
  let oldImageUrl = null;
  try {
    const existing = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    oldImageUrl = existing?.profile_image || null;

    newImageUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'images');

    const expert = await prisma.expert.update({
      where: { user_id: req.user.id },
      data: { profile_image: newImageUrl },
    });

    // DB update succeeded — safe to delete old image now
    await deleteFile(oldImageUrl);

    // Push the new image to Webflow immediately for approved, published experts.
    // Fire-and-forget so the API response is not delayed by the Webflow call.
    if (existing?.status === 'APPROVED' && existing?.webflow_item_id) {
      syncExpert(existing.id).catch((e) =>
        console.error('[Webflow] Profile image sync failed:', e.message)
      );
    }

    return res.json({ profile_image: newImageUrl, expert });
  } catch (err) {
    await deleteFile(newImageUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
}

// ─── Qualifications ───────────────────────────────────────────────────────────

async function addQualification(req, res) {
  const { type, custom_name } = req.body;

  if (!type || !VALID_QUALIFICATION_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid qualification type.' });
  }
  if (type === 'OTHER' && !custom_name?.trim()) {
    return res.status(400).json({ error: 'custom_name is required when type is OTHER.' });
  }

  let newDocUrl = null;
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    if (req.file) {
      newDocUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'documents');
    }

    const qualification = await prisma.qualification.create({
      data: {
        expert_id: expert.id,
        type,
        custom_name: type === 'OTHER' ? custom_name.trim() : null,
        document_url: newDocUrl,
      },
    });
    return res.status(201).json(qualification);
  } catch (err) {
    await deleteFile(newDocUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateQualification(req, res) {
  const { id } = req.params;
  const { custom_name } = req.body;

  let newDocUrl = null;
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.qualification.findUnique({ where: { id: parseInt(id) } });
    if (!existing || existing.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Qualification not found' });
    }

    if (req.file) {
      newDocUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'documents');
    }

    const updated = await prisma.qualification.update({
      where: { id: parseInt(id) },
      data: {
        ...(custom_name !== undefined && existing.type === 'OTHER' && { custom_name: custom_name.trim() }),
        ...(newDocUrl && { document_url: newDocUrl }),
      },
    });

    // DB update succeeded — safe to delete old document now
    if (newDocUrl) await deleteFile(existing.document_url);

    return res.json(updated);
  } catch (err) {
    await deleteFile(newDocUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteQualification(req, res) {
  const { id } = req.params;

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.qualification.findUnique({ where: { id: parseInt(id) } });
    if (!existing || existing.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Qualification not found' });
    }

    await prisma.qualification.delete({ where: { id: parseInt(id) } });
    await deleteFile(existing.document_url);
    return res.json({ message: 'Qualification deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── Certifications ───────────────────────────────────────────────────────────

async function addCertification(req, res) {
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Certification name is required.' });
  }

  let newDocUrl = null;
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    if (req.file) {
      newDocUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'documents');
    }

    const certification = await prisma.certification.create({
      data: {
        expert_id: expert.id,
        name: name.trim(),
        document_url: newDocUrl,
      },
    });
    return res.status(201).json(certification);
  } catch (err) {
    await deleteFile(newDocUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateCertification(req, res) {
  const { id } = req.params;
  const { name } = req.body;

  let newDocUrl = null;
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.certification.findUnique({ where: { id: parseInt(id) } });
    if (!existing || existing.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    if (req.file) {
      newDocUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'documents');
    }

    const updated = await prisma.certification.update({
      where: { id: parseInt(id) },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(newDocUrl && { document_url: newDocUrl }),
      },
    });

    // DB update succeeded — safe to delete old document now
    if (newDocUrl) await deleteFile(existing.document_url);

    return res.json(updated);
  } catch (err) {
    await deleteFile(newDocUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteCertification(req, res) {
  const { id } = req.params;

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.certification.findUnique({ where: { id: parseInt(id) } });
    if (!existing || existing.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    await prisma.certification.delete({ where: { id: parseInt(id) } });
    await deleteFile(existing.document_url);
    return res.json({ message: 'Certification deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── Insurance ────────────────────────────────────────────────────────────────

async function saveInsurance(req, res) {
  const { policy_expires_at } = req.body;

  if (!policy_expires_at) {
    return res.status(400).json({ error: 'policy_expires_at is required.' });
  }

  const expiryDate = new Date(policy_expires_at);
  if (isNaN(expiryDate.getTime())) {
    return res.status(400).json({ error: 'Invalid policy_expires_at date.' });
  }
  if (expiryDate <= new Date()) {
    return res.status(400).json({ error: 'Policy expiry date must be in the future.' });
  }

  let newDocUrl = null;
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.insurance.findUnique({ where: { expert_id: expert.id } });

    if (req.file) {
      newDocUrl = await uploadFile(req.file.buffer, req.user.id, req.file.originalname, 'documents');
    }

    // First creation requires a document
    if (!existing && !newDocUrl) {
      return res.status(400).json({ error: 'Insurance document is required.' });
    }

    const insurance = await prisma.insurance.upsert({
      where: { expert_id: expert.id },
      update: {
        policy_expires_at: expiryDate,
        ...(newDocUrl && { document_url: newDocUrl }),
      },
      create: {
        expert_id: expert.id,
        document_url: newDocUrl,
        policy_expires_at: expiryDate,
      },
    });

    // DB update succeeded — safe to delete old document now
    if (newDocUrl) await deleteFile(existing?.document_url);

    return res.json(insurance);
  } catch (err) {
    await deleteFile(newDocUrl);
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteInsurance(req, res) {
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const existing = await prisma.insurance.findUnique({ where: { expert_id: expert.id } });
    if (!existing) return res.status(404).json({ error: 'No insurance record found' });

    await prisma.insurance.delete({ where: { expert_id: expert.id } });
    await deleteFile(existing.document_url);
    return res.json({ message: 'Insurance record deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── Business Information ─────────────────────────────────────────────────────

const VALID_ENTITY_TYPES = ['INDIVIDUAL', 'COMPANY'];

async function saveBusinessInfo(req, res) {
  const {
    entity_type, legal_name, date_of_birth,
    address_street, address_city, address_postal_code, address_country,
    tin, vat_number, company_reg_number,
    iban, business_email, website, municipality, business_address,
  } = req.body;

  // Required field validation
  if (!entity_type || !VALID_ENTITY_TYPES.includes(entity_type)) {
    return res.status(400).json({ error: 'entity_type must be INDIVIDUAL or COMPANY.' });
  }
  if (!legal_name?.trim()) {
    return res.status(400).json({ error: 'Full legal name is required.' });
  }
  if (entity_type === 'INDIVIDUAL' && !date_of_birth) {
    return res.status(400).json({ error: 'Date of birth is required for individual experts.' });
  }
  if (!address_street?.trim()) {
    return res.status(400).json({ error: 'Street address is required.' });
  }
  if (!address_city?.trim()) {
    return res.status(400).json({ error: 'City is required.' });
  }
  if (!address_postal_code?.trim()) {
    return res.status(400).json({ error: 'Postal code is required.' });
  }
  if (!address_country?.trim()) {
    return res.status(400).json({ error: 'Country is required.' });
  }
  if (!/^[a-zA-Z]{2}$/.test(address_country.trim())) {
    return res.status(400).json({ error: 'Country must be a valid ISO country selection.' });
  }
  if (!tin?.trim()) {
    return res.status(400).json({ error: 'Tax Identification Number (TIN) is required.' });
  }
  if (entity_type === 'COMPANY' && !company_reg_number?.trim()) {
    return res.status(400).json({ error: 'Company registration number is required for legal entities.' });
  }
  if (!iban?.trim()) {
    return res.status(400).json({ error: 'IBAN / bank account is required.' });
  }
  if (!business_email?.trim()) {
    return res.status(400).json({ error: 'Email address is required.' });
  }
  // Parse date_of_birth for INDIVIDUAL
  let dob = null;
  if (entity_type === 'INDIVIDUAL' && date_of_birth) {
    dob = new Date(date_of_birth);
    if (isNaN(dob.getTime())) {
      return res.status(400).json({ error: 'Invalid date of birth.' });
    }
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const encryptedIban = encryptIban(iban.trim());

    const info = await prisma.businessInfo.upsert({
      where: { expert_id: expert.id },
      update: {
        entity_type,
        legal_name:          legal_name.trim(),
        date_of_birth:       dob,
        address_street:      address_street.trim(),
        address_city:        address_city.trim(),
        address_postal_code: address_postal_code.trim(),
        address_country:     address_country.trim().toLowerCase(),
        tin:                 tin.trim(),
        vat_number:          vat_number?.trim()             || null,
        company_reg_number:  entity_type === 'COMPANY' ? company_reg_number.trim() : null,
        iban:                encryptedIban,
        business_email:      business_email.trim(),
        website:             website?.trim()             || null,
        municipality:        municipality?.trim()           || null,
        business_address:    business_address?.trim()       || null,
      },
      create: {
        expert:              { connect: { id: expert.id } },
        entity_type,
        legal_name:          legal_name.trim(),
        date_of_birth:       dob,
        address_street:      address_street.trim(),
        address_city:        address_city.trim(),
        address_postal_code: address_postal_code.trim(),
        address_country:     address_country.trim().toLowerCase(),
        tin:                 tin.trim(),
        vat_number:          vat_number?.trim()             || null,
        company_reg_number:  entity_type === 'COMPANY' ? company_reg_number.trim() : null,
        iban:                encryptedIban,
        business_email:      business_email.trim(),
        website:             website?.trim()             || null,
        municipality:        municipality?.trim()           || null,
        business_address:    business_address?.trim()       || null,
      },
    });
    return res.json({ ...info, iban: decryptIban(info.iban) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /experts — public list of approved experts (for parent browse) ───────
async function listExperts(_req, res) {
  try {
    const experts = await prisma.expert.findMany({
      where: {
        status:                     'APPROVED',
        stripe_onboarding_complete: true,   // only show experts ready to accept payments
        is_published:               true,   // admin force-unpublish hides from parent search
      },
      select: {
        id:             true,
        profile_image:  true,
        summary:        true,
        position:       true,
        // session_format — managed per-service
        address_street:    true,
        address_city:      true,
        address_postcode:  true,
        languages:         true,
        user: {
          select: { name: true },
        },
        services: {
          where:   { is_active: true },
          select:  { id: true, title: true, price: true, duration_minutes: true, format: true, cluster: true, currency: true },
          orderBy: { id: 'asc' },
        },
        qualifications: {
          select: { type: true, custom_name: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return res.json(experts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── Notification preferences ─────────────────────────────────────────────────

async function getNotificationPreferences(req, res) {
  try {
    const expert = await prisma.expert.findUnique({
      where:  { user_id: req.user.id },
      select: { notify_new_booking: true, notify_cancellation: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    return res.json(expert);
  } catch (err) {
    console.error('[getNotificationPreferences]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateNotificationPreferences(req, res) {
  try {
    const { notify_new_booking, notify_cancellation } = req.body;

    const data = {};
    if (typeof notify_new_booking  === 'boolean') data.notify_new_booking  = notify_new_booking;
    if (typeof notify_cancellation === 'boolean') data.notify_cancellation = notify_cancellation;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided' });
    }

    const expert = await prisma.expert.update({
      where:  { user_id: req.user.id },
      data,
      select: { notify_new_booking: true, notify_cancellation: true },
    });

    return res.json(expert);
  } catch (err) {
    console.error('[updateNotificationPreferences]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  listExperts,
  getMyProfile,
  updateMyProfile,
  getExpertById,
  uploadProfileImage,
  addQualification,
  updateQualification,
  deleteQualification,
  addCertification,
  updateCertification,
  deleteCertification,
  saveInsurance,
  deleteInsurance,
  saveBusinessInfo,
  getMyProfileDraft,
  getNotificationPreferences,
  updateNotificationPreferences,
};
