const prisma = require('../prisma/client');

/**
 * Write one row to AdminAuditLog. Fire-and-forget — never throws.
 *
 * admin_id has no FK constraint so logs survive GDPR-deleted accounts.
 * For non-admin actors (parents, experts) pass the user's own ID as actorId;
 * getAuditLog resolves it to a name the same way it does for admins.
 */
async function logAudit(actorId, action, entityType, entityId, note = null) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        admin_id:    actorId,
        action,
        entity_type: entityType,
        entity_id:   entityId,
        note,
      },
    });
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
