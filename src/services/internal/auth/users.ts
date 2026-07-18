import { prisma } from '@/lib/prisma';
import type { Prisma, User } from '@/lib/prisma';

export function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function getUserByGoogleId(googleId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { googleId } });
}

export function createUser(data: Prisma.UserCreateInput): Promise<User> {
  return prisma.user.create({ data: { ...data, email: data.email.toLowerCase() } });
}

export function updateUserByEmail(email: string, data: Prisma.UserUpdateInput): Promise<User> {
  return prisma.user.update({ where: { email: email.toLowerCase() }, data });
}

export function updateUserById(id: string, data: Prisma.UserUpdateInput): Promise<User> {
  return prisma.user.update({ where: { id }, data });
}

export function countUsers(): Promise<number> {
  return prisma.user.count();
}
