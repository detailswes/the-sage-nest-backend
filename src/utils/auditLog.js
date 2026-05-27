const prisma = require('../prisma/client');

/**
 * Write one row to AdminAuditLog. Fire-and-forget — never throws.
 *
 * admin_id has no FK constraint so logs survive GDPR-deleted accounts.
 * For non-admin actors (parents, experts) pass the user's own ID as actorId;
 * getAuditLog resolves it to a name the same way it does for admins.
 */
const AUDIT_LOG_CAP = 20;

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

    // Rolling window: keep only the most recent AUDIT_LOG_CAP entries per entity
    const count = await prisma.adminAuditLog.count({
      where: { entity_id: entityId, entity_type: entityType },
    });
    if (count > AUDIT_LOG_CAP) {
      const oldest = await prisma.adminAuditLog.findMany({
        where: { entity_id: entityId, entity_type: entityType },
        orderBy: { created_at: 'asc' },
        take: count - AUDIT_LOG_CAP,
        select: { id: true },
      });
      await prisma.adminAuditLog.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
    }
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
