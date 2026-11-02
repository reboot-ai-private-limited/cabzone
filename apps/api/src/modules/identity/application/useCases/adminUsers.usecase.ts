import type {
  AdminRolePermissionDto,
  AdminUserDetailDto,
  AdminUserSummaryDto,
  CreateAdminUserDto,
  ListAdminUsersQueryDto,
  ListAdminUsersResponseDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from '@cabzone/contracts';
import { hashPassword } from '../../../../shared/auth/password.util.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { ZoneRepositoryPort } from '../../../zone/zone.public.js';
import type {
  AdminUserEntity,
  AdminUserRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from '../../domain/index.js';

export const ADMIN_ROLE_PERMISSIONS: AdminRolePermissionDto[] = [
  {
    role: 'SUPER_ADMIN',
    title: 'Super Administrator',
    description:
      'Full master privileges across platform configurations, regional zones, pricing engine, driver onboarding, finance adjustments, and staff management.',
    tier: 'SYSTEM',
    permissions: [
      {
        module: 'Staff Management',
        action: 'Manage Admins',
        description: 'Create, edit, suspend, and assign roles to administrative staff',
      },
      {
        module: 'Geography',
        action: 'Zone Control Plane',
        description: 'Create, modify, boundary repair, and deactivate geographic zones',
      },
      {
        module: 'Pricing',
        action: 'Pricing Configuration',
        description: 'Define base rates, per-km rates, tier multipliers, and surge policies',
      },
      {
        module: 'Fleet & KYC',
        action: 'Approve & Suspend Drivers',
        description: 'Review applications, manage document verifications, inspect fleet',
      },
      {
        module: 'Finance & Ledger',
        action: 'Wallet Adjustments',
        description: 'Manual credit/debit adjustments, balance audits, refund authorizations',
      },
      {
        module: 'Dispatch',
        action: 'Live Operations',
        description: 'Live tracking, override dispatches, force cancellations with reason',
      },
    ],
  },
  {
    role: 'CITY_ADMIN',
    title: 'City Operations Manager',
    description:
      'Regional operational authority restricted to assigned city zones (e.g. Siliguri, Darjeeling). Responsible for local driver onboarding, dispatch performance, and territory monitoring.',
    tier: 'REGIONAL',
    permissions: [
      {
        module: 'Fleet & KYC',
        action: 'Regional KYC Review',
        description: 'Review and approve driver applications registered within assigned cities',
      },
      {
        module: 'Fleet & KYC',
        action: 'Fleet Directory',
        description: 'Inspect online drivers, shift hours, and vehicle status within territory',
      },
      {
        module: 'Dispatch',
        action: 'Regional Dispatch Control',
        description: 'Monitor live rides, unfulfilled demand, and driver queues in territory',
      },
      {
        module: 'Geography',
        action: 'Zone Reference',
        description: 'Inspect territorial boundaries, pickup zones, and hill terrain coverage',
      },
    ],
  },
  {
    role: 'SUPPORT_ADMIN',
    title: 'Customer & Driver Support',
    description:
      'Operational support agent equipped to resolve rider complaints, investigate driver trip discrepancies, inspect safety incidents, and update profiles.',
    tier: 'OPERATIONS',
    permissions: [
      {
        module: 'Customers',
        action: 'Customer Dossier',
        description: 'Inspect rider history, view safety status, update language preferences',
      },
      {
        module: 'Fleet & KYC',
        action: 'Driver Dossier',
        description: 'Inspect vehicle documents, license validity, profile details',
      },
      {
        module: 'Dispatch',
        action: 'Trip Investigation',
        description: 'Inspect fare breakdown, route timeline, OTP confirmation audit',
      },
      {
        module: 'Customers',
        action: 'Account Restriction',
        description: 'Flag or temporarily suspend accounts with safety or violation notes',
      },
    ],
  },
  {
    role: 'FINANCE_ADMIN',
    title: 'Finance & Accounts Manager',
    description:
      'Financial oversight manager responsible for driver wallet reconciliations, manual credit/debit adjustments, settlement reviews, and pricing simulator testing.',
    tier: 'FINANCE',
    permissions: [
      {
        module: 'Finance & Ledger',
        action: 'Driver Wallets',
        description: 'Inspect live driver ledger balances, deposits, and commission deductions',
      },
      {
        module: 'Finance & Ledger',
        action: 'Manual Adjustments',
        description: 'Post credit or debit wallet adjustments with required audit reason',
      },
      {
        module: 'Pricing',
        action: 'Fare Simulator',
        description: 'Verify route rate cards, toll calculations, and state border crossing estimates',
      },
      {
        module: 'Finance & Ledger',
        action: 'Settlements & Payouts',
        description: 'Audit payout requests and batch bank reconciliation exports',
      },
    ],
  },
];

export interface AdminUserDeps {
  adminUserRepo: AdminUserRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  zoneRepo?: ZoneRepositoryPort | undefined;
}

export class ListAdminUsersUseCase {
  constructor(private readonly deps: AdminUserDeps) {}

  async execute(query: ListAdminUsersQueryDto): Promise<ListAdminUsersResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    const { admins, total } = await this.deps.adminUserRepo.list({
      search: query.search,
      role: query.role,
      status: query.status,
      zoneId: query.zoneId,
      limit,
      offset,
    });

    const dtoList: AdminUserSummaryDto[] = admins.map((a) => ({
      id: a.id,
      userId: a.userId,
      phoneE164: a.phoneE164,
      name: a.name,
      email: a.email,
      role: a.role,
      cityZoneIds: a.cityZoneIds,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    return {
      admins: dtoList,
      total,
      limit,
      offset,
    };
  }
}

export class GetAdminUserDetailUseCase {
  constructor(private readonly deps: AdminUserDeps) {}

  async execute(adminId: string): Promise<AdminUserDetailDto> {
    const admin = await this.deps.adminUserRepo.findById(adminId);
    if (!admin) {
      throw AppError.notFound('Admin user not found.');
    }

    const user = await this.deps.userRepo.findById(admin.userId);
    if (!user) {
      throw AppError.notFound('Associated user account not found.');
    }

    let cityZones: Array<{ id: string; name: string; code?: string }> | undefined;
    if (this.deps.zoneRepo && admin.cityZoneIds.length > 0) {
      const zonePromises = admin.cityZoneIds.map((id) => this.deps.zoneRepo!.findById(id));
      const resolved = await Promise.all(zonePromises);
      cityZones = resolved
        .filter((z): z is NonNullable<typeof z> => z !== null)
        .map((z) => ({
          id: z.id,
          name: z.name,
          code: z.code,
        }));
    }

    return {
      id: admin.id,
      userId: admin.userId,
      phoneE164: user.phoneE164,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      cityZoneIds: admin.cityZoneIds,
      cityZones,
      status: admin.status,
      createdAt: admin.createdAt.toISOString(),
      updatedAt: admin.updatedAt.toISOString(),
    };
  }
}

export class CreateAdminUserUseCase {
  constructor(private readonly deps: AdminUserDeps) {}

  async execute(input: CreateAdminUserDto): Promise<AdminUserDetailDto> {
    const phone = input.phoneE164.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw AppError.badRequest('Valid E.164 phone number is required (e.g. +919876543210).');
    }

    const name = input.name.trim();
    if (!name) {
      throw AppError.badRequest('Staff name is required.');
    }

    // Find or create underlying User
    const existingUser = await this.deps.userRepo.findByPhone(phone);
    const user =
      existingUser ??
      (await this.deps.userRepo.create({
        id: newUuid(),
        phoneE164: phone,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    // Check if admin record already exists for this user
    const existingAdmin = await this.deps.adminUserRepo.findByUserId(user.id);
    if (existingAdmin) {
      throw AppError.conflict('An administrative account is already registered for this phone number.');
    }

    const passwordHash = input.password ? hashPassword(input.password) : null;

    const newAdmin: AdminUserEntity = {
      id: newUuid(),
      userId: user.id,
      name,
      email: input.email?.trim() || null,
      passwordHash,
      role: input.role,
      cityZoneIds: input.cityZoneIds ?? [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const saved = await this.deps.adminUserRepo.save(newAdmin);

    let cityZones: Array<{ id: string; name: string; code?: string }> | undefined;
    if (this.deps.zoneRepo && saved.cityZoneIds.length > 0) {
      const zonePromises = saved.cityZoneIds.map((id) => this.deps.zoneRepo!.findById(id));
      const resolved = await Promise.all(zonePromises);
      cityZones = resolved
        .filter((z): z is NonNullable<typeof z> => z !== null)
        .map((z) => ({
          id: z.id,
          name: z.name,
          code: z.code,
        }));
    }

    return {
      id: saved.id,
      userId: saved.userId,
      phoneE164: user.phoneE164,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      cityZoneIds: saved.cityZoneIds,
      cityZones,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}

export class UpdateAdminUserUseCase {
  constructor(private readonly deps: AdminUserDeps) {}

  async execute(
    adminId: string,
    callerUserId: string,
    input: UpdateAdminUserDto,
  ): Promise<AdminUserDetailDto> {
    const admin = await this.deps.adminUserRepo.findById(adminId);
    if (!admin) {
      throw AppError.notFound('Admin user not found.');
    }

    // Self-protection: Prevent demoting one's own SUPER_ADMIN account
    if (admin.userId === callerUserId && input.role && input.role !== 'SUPER_ADMIN') {
      throw AppError.badRequest('You cannot demote your own account from SUPER_ADMIN.');
    }

    const updates: Partial<
      Pick<AdminUserEntity, 'name' | 'email' | 'role' | 'cityZoneIds' | 'passwordHash'>
    > = {};
    if (input.name !== undefined) updates.name = input.name ? input.name.trim() : null;
    if (input.email !== undefined) updates.email = input.email ? input.email.trim() : null;
    if (input.password !== undefined && input.password.trim()) {
      updates.passwordHash = hashPassword(input.password);
    }
    if (input.role !== undefined) updates.role = input.role;
    if (input.cityZoneIds !== undefined) updates.cityZoneIds = input.cityZoneIds;

    const updated = await this.deps.adminUserRepo.update(adminId, updates);
    if (!updated) {
      throw AppError.notFound('Admin user not found.');
    }

    const user = await this.deps.userRepo.findById(updated.userId);
    if (!user) {
      throw AppError.notFound('Associated user not found.');
    }

    const roleChanged = input.role !== undefined && input.role !== admin.role;
    const zonesChanged =
      input.cityZoneIds !== undefined &&
      (input.cityZoneIds.length !== admin.cityZoneIds.length ||
        input.cityZoneIds.some((z, i) => z !== admin.cityZoneIds[i]));
    const otherPasswordChanged =
      Boolean(input.password && input.password.trim()) && admin.userId !== callerUserId;
    if (roleChanged || zonesChanged || otherPasswordChanged) {
      await this.deps.sessionRepo.revokeAllForUser(admin.userId);
    }

    let cityZones: Array<{ id: string; name: string; code?: string }> | undefined;
    if (this.deps.zoneRepo && updated.cityZoneIds.length > 0) {
      const zonePromises = updated.cityZoneIds.map((id) => this.deps.zoneRepo!.findById(id));
      const resolved = await Promise.all(zonePromises);
      cityZones = resolved
        .filter((z): z is NonNullable<typeof z> => z !== null)
        .map((z) => ({
          id: z.id,
          name: z.name,
          code: z.code,
        }));
    }

    return {
      id: updated.id,
      userId: updated.userId,
      phoneE164: user.phoneE164,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      cityZoneIds: updated.cityZoneIds,
      cityZones,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}

export class UpdateAdminUserStatusUseCase {
  constructor(private readonly deps: AdminUserDeps) {}

  async execute(
    adminId: string,
    callerUserId: string,
    input: UpdateAdminUserStatusDto,
  ): Promise<AdminUserSummaryDto> {
    const admin = await this.deps.adminUserRepo.findById(adminId);
    if (!admin) {
      throw AppError.notFound('Admin user not found.');
    }

    // Self-protection: Prevent a super admin from suspending themselves
    if (admin.userId === callerUserId && input.status === 'SUSPENDED') {
      throw AppError.badRequest('You cannot suspend your own administrative account.');
    }

    const updated = await this.deps.adminUserRepo.update(adminId, { status: input.status });
    if (!updated) {
      throw AppError.notFound('Admin user not found.');
    }

    // When suspending an admin, immediately revoke all active sessions and refresh tokens
    if (input.status === 'SUSPENDED') {
      await this.deps.sessionRepo.revokeAllForUser(admin.userId);
    }

    const user = await this.deps.userRepo.findById(updated.userId);

    return {
      id: updated.id,
      userId: updated.userId,
      phoneE164: user?.phoneE164 ?? '',
      name: updated.name,
      email: updated.email,
      role: updated.role,
      cityZoneIds: updated.cityZoneIds,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
