/**
 * Seed script — creates a test parent user and upcoming bookings for the first expert.
 * Run with: npx prisma db seed
 *
 * Safe to re-run: skips if test parent already exists; always creates fresh bookings.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Find the first expert that has active services ────────────────────────
  const expert = await prisma.expert.findFirst({
    where: { services: { some: { is_active: true } } },
    include: {
      services: { where: { is_active: true }, take: 3 },
      user: { select: { name: true } },
    },
  });

  if (!expert) {
    console.log('No expert with active services found. Add at least one service first, then re-run the seed.');
    return;
  }

  console.log(`Seeding bookings for expert: ${expert.user.name} (id=${expert.id})`);

  // ── Create (or find) test parent user ─────────────────────────────────────
  const parentEmail = 'test.parent@sagenest.dev';
  let parentUser = await prisma.user.findUnique({ where: { email: parentEmail } });

  if (!parentUser) {
    const password_hash = await bcrypt.hash('TestParent123!', 10);
    parentUser = await prisma.user.create({
      data: {
        name: 'Sarah Murphy',
        email: parentEmail,
        password_hash,
        role: 'PARENT',
        is_verified: true,
      },
    });
    console.log(`Created test parent: ${parentUser.name} (${parentEmail})`);
  } else {
    console.log(`Using existing test parent: ${parentUser.name}`);
  }

  // ── Delete any existing seed bookings for this expert (fresh start) ────────
  await prisma.booking.deleteMany({
    where: { expert_id: expert.id, parent_id: parentUser.id },
  });

  // ── Create upcoming bookings spread across the next 14 days ───────────────
  const services = expert.services;
  const now = new Date();

  const bookingTemplates = [
    { daysFromNow: 1,  hour: 10, serviceIndex: 0, format: 'ONLINE',     session_link_sent: false },
    { daysFromNow: 2,  hour: 14, serviceIndex: 1 % services.length, format: 'ONLINE',     session_link_sent: true  },
    { daysFromNow: 4,  hour: 9,  serviceIndex: 0, format: 'IN_PERSON',  session_link_sent: false },
    { daysFromNow: 7,  hour: 11, serviceIndex: 2 % services.length, format: 'ONLINE',     session_link_sent: false },
    { daysFromNow: 9,  hour: 15, serviceIndex: 1 % services.length, format: 'IN_PERSON',  session_link_sent: false },
    { daysFromNow: 12, hour: 10, serviceIndex: 0, format: 'ONLINE',     session_link_sent: false },
  ];

  for (const t of bookingTemplates) {
    const service = services[t.serviceIndex];
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + t.daysFromNow);
    scheduledAt.setHours(t.hour, 0, 0, 0);

    await prisma.booking.create({
      data: {
        expert_id:        expert.id,
        parent_id:        parentUser.id,
        service_id:       service.id,
        scheduled_at:     scheduledAt,
        duration_minutes: service.duration_minutes,
        format:           t.format,
        status:           'CONFIRMED',
        session_link_sent: t.session_link_sent,
      },
    });
  }

  console.log(`Created ${bookingTemplates.length} upcoming bookings.`);

  // ── Create a couple of blockouts for testing ────────────────────────────────
  await prisma.availabilityBlock.deleteMany({ where: { expert_id: expert.id } });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 3);
  tomorrow.setHours(0, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 8);
  nextWeek.setHours(0, 0, 0, 0);

  await prisma.availabilityBlock.create({
    data: {
      expert_id:  expert.id,
      date:       tomorrow,
      start_time: null,  // full-day block
      end_time:   null,
    },
  });

  await prisma.availabilityBlock.create({
    data: {
      expert_id:  expert.id,
      date:       nextWeek,
      start_time: '13:00',
      end_time:   '15:00',
    },
  });

  console.log('Created 2 test block-outs (1 full-day, 1 time slot).');
  console.log('\nSeed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
