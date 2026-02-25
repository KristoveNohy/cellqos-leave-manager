import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const defaultPassword = "Password123!";
  const hash = await bcrypt.hash(defaultPassword, 10);

  const team = await prisma.team.upsert({
    where: { id: 1n },
    update: {},
    create: {
      id: 1n,
      name: "Engineering",
      maxConcurrentLeaves: 2,
    },
  });

  await prisma.user.upsert({
    where: { id: "user_manager_placeholder" },
    update: {
      passwordHash: hash,
      mustChangePassword: true,
      role: "MANAGER",
      teamId: team.id,
      isActive: true,
    },
    create: {
      id: "user_manager_placeholder",
      email: "manager@cellqos.com",
      name: "Manager User",
      role: "MANAGER",
      teamId: team.id,
      isActive: true,
      passwordHash: hash,
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { id: "user_admin_placeholder" },
    update: {
      passwordHash: hash,
      mustChangePassword: true,
      role: "ADMIN",
      teamId: null,
      isActive: true,
    },
    create: {
      id: "user_admin_placeholder",
      email: "admin@cellqos.com",
      name: "Admin User",
      role: "ADMIN",
      teamId: null,
      isActive: true,
      passwordHash: hash,
      mustChangePassword: true,
    },
  });

  const employees = [
    { id: "user_anna_placeholder", email: "anna@cellqos.com", name: "Anna Novakova" },
    { id: "user_peter_placeholder", email: "peter@cellqos.com", name: "Peter Horvath" },
    { id: "user_lucia_placeholder", email: "lucia@cellqos.com", name: "Lucia Kovacova" },
  ];

  for (const employee of employees) {
    await prisma.user.upsert({
      where: { id: employee.id },
      update: {
        passwordHash: hash,
        mustChangePassword: true,
        role: "EMPLOYEE",
        teamId: team.id,
        isActive: true,
      },
      create: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: "EMPLOYEE",
        teamId: team.id,
        isActive: true,
        passwordHash: hash,
        mustChangePassword: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
