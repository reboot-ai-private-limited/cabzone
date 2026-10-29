import type {
  FinanceStatsDto,
  ListTransactionsQueryDto,
  ListWalletsQueryDto,
  WalletSummaryDto,
  WalletTransactionDto,
} from '@cabzone/contracts';
import type {
  UserLookupItem,
  WalletEntity,
  WalletRepositoryPort,
  WalletTransactionEntity,
} from '../../domain/index.js';

export class MemoryWalletRepository implements WalletRepositoryPort {
  private readonly wallets = new Map<string, WalletEntity>();
  private readonly transactions: WalletTransactionEntity[] = [];

  async findAllWallets(driverId?: string): Promise<WalletEntity[]> {
    const all = Array.from(this.wallets.values());
    const filtered = driverId ? all.filter((w) => w.driverId === driverId) : all;
    return filtered.map((w) => ({ ...w }));
  }

  async findTransactionByIdempotencyKey(key: string): Promise<WalletTransactionEntity | null> {
    const transaction = this.transactions.find((entry) => entry.idempotencyKey === key);
    return transaction ? { ...transaction } : null;
  }

  async findByDriverId(driverId: string): Promise<WalletEntity | null> {
    for (const wallet of this.wallets.values()) {
      if (wallet.driverId === driverId) {
        return { ...wallet };
      }
    }
    return null;
  }

  async findByRiderId(riderId: string): Promise<WalletEntity | null> {
    for (const wallet of this.wallets.values()) {
      if (wallet.riderId === riderId) {
        return { ...wallet };
      }
    }
    return null;
  }

  async findById(id: string): Promise<WalletEntity | null> {
    const found = this.wallets.get(id);
    return found ? { ...found } : null;
  }

  async save(wallet: WalletEntity): Promise<WalletEntity> {
    const owedPaise = Math.max(0, -wallet.balancePaise);
    this.wallets.set(wallet.id, { ...wallet, owedPaise, updatedAt: new Date() });
    return { ...this.wallets.get(wallet.id)! };
  }

  async recordTransaction(
    transaction: WalletTransactionEntity,
  ): Promise<WalletTransactionEntity> {
    if (
      transaction.idempotencyKey &&
      this.transactions.some((entry) => entry.idempotencyKey === transaction.idempotencyKey)
    ) {
      throw Object.assign(
        new Error(`E11000 duplicate key error idempotency_key: ${transaction.idempotencyKey}`),
        { code: 11000 },
      );
    }
    const copy = { ...transaction };
    this.transactions.push(copy);
    return { ...copy };
  }

  async findTransactionsByWalletId(
    walletId: string,
    limit?: number,
  ): Promise<WalletTransactionEntity[]> {
    const items = this.transactions
      .filter((t) => t.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = limit !== undefined ? items.slice(0, limit) : items;
    return sliced.map((t) => ({ ...t }));
  }

  async listTransactions(
    query: ListTransactionsQueryDto,
  ): Promise<{ items: WalletTransactionDto[]; total: number }> {
    if (query.referenceIds && query.referenceIds.length === 0) {
      return { items: [], total: 0 };
    }
    let result = [...this.transactions];
    if (query.walletId) result = result.filter((t) => t.walletId === query.walletId);
    if (query.driverId) result = result.filter((t) => t.driverId === query.driverId);
    if (query.riderId) result = result.filter((t) => t.riderId === query.riderId);
    if (query.types && query.types.length > 0) {
      const allowed = new Set(query.types);
      result = result.filter((t) => allowed.has(t.type));
    } else if (query.type) {
      result = result.filter((t) => t.type === query.type);
    }
    if (query.referenceTypes && query.referenceTypes.length > 0) {
      const allowedRefs = new Set(query.referenceTypes);
      result = result.filter((t) => allowedRefs.has(t.referenceType));
    } else if (query.referenceType) {
      result = result.filter((t) => t.referenceType === query.referenceType);
    }
    if (query.referenceIds) {
      const ids = new Set(query.referenceIds);
      result = result.filter((t) => t.referenceId !== null && ids.has(t.referenceId));
    }
    if (query.search && query.search.trim()) {
      const s = query.search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          (t.note && t.note.toLowerCase().includes(s)) ||
          (t.referenceId && t.referenceId.toLowerCase().includes(s)),
      );
    }

    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = result.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    const items: WalletTransactionDto[] = result.slice(offset, offset + limit).map((t) => ({
      bucket: t.bucket ?? 'COMMISSION',
      id: t.id,
      walletId: t.walletId,
      ownerType: t.ownerType,
      driverId: t.driverId ?? null,
      riderId: t.riderId ?? null,
      type: t.type,
      amountPaise: t.amountPaise,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      idempotencyKey: t.idempotencyKey,
      balanceBeforePaise: t.balanceBeforePaise,
      balanceAfterPaise: t.balanceAfterPaise,
      createdBy: t.createdBy,
      note: t.note ?? null,
      createdAt: t.createdAt.toISOString(),
    }));

    return { items, total };
  }

  async getStats(): Promise<FinanceStatsDto> {
    const allWallets = Array.from(this.wallets.values());
    const customerWallets = allWallets.filter((w) => w.ownerType === 'RIDER');
    const driverWallets = allWallets.filter((w) => w.ownerType !== 'RIDER');

    let creditOutstandingPaise = 0;
    let creditCustomersCount = 0;
    let owedByCustomersPaise = 0;
    let owedCustomersCount = 0;

    for (const cw of customerWallets) {
      if (cw.balancePaise > 0) {
        creditOutstandingPaise += cw.balancePaise;
        creditCustomersCount += 1;
      }
      if ((cw.owedPaise ?? 0) > 0) {
        owedByCustomersPaise += cw.owedPaise ?? 0;
        owedCustomersCount += 1;
      }
    }

    let totalDriverBalancePaise = 0;
    let activeDriversCount = 0;
    let blockedDriversCount = 0;
    let owedToCompanyPaise = 0;
    let owedDriversCount = 0;
    let payableToDriversPaise = 0;
    let payableDriversCount = 0;
    let suspendedCount = 0;

    for (const dw of driverWallets) {
      if (dw.balancePaise > 0) {
        totalDriverBalancePaise += dw.balancePaise;
        payableToDriversPaise += dw.balancePaise;
        payableDriversCount += 1;
      }
      if (dw.balancePaise < 0 || (dw.owedPaise ?? 0) > 0) {
        const owed = dw.balancePaise < 0 ? Math.abs(dw.balancePaise) : (dw.owedPaise ?? 0);
        owedToCompanyPaise += owed;
        owedDriversCount += 1;
      }
      if (dw.status === 'BLOCKED') {
        suspendedCount += 1;
      }
      if (dw.status === 'ACTIVE' && dw.balancePaise > 0) {
        activeDriversCount += 1;
      } else {
        blockedDriversCount += 1;
      }
    }

    const driverIdsWithTx = new Set<string>();
    for (const tx of this.transactions) {
      if (tx.driverId) {
        driverIdsWithTx.add(tx.driverId);
      } else if (tx.walletId) {
        const w = this.wallets.get(tx.walletId);
        if (w?.driverId) driverIdsWithTx.add(w.driverId);
      }
    }
    const driversWithActivityCount = driverIdsWithTx.size;

    let totalVolumePaise = 0;
    let platformCommissionPaise = 0;
    let adjustmentsPaise = 0;

    for (const tx of this.transactions) {
      totalVolumePaise += tx.amountPaise;
      if (tx.referenceType === 'RIDE_COMMISSION') platformCommissionPaise += tx.amountPaise;
      if (tx.referenceType === 'ADMIN_ADJUSTMENT') {
        adjustmentsPaise += tx.type === 'CREDIT' ? tx.amountPaise : -tx.amountPaise;
      }
    }

    return {
      customer: {
        creditOutstandingPaise,
        creditCustomersCount,
        owedByCustomersPaise,
        owedCustomersCount,
        totalCustomersWithWallets: customerWallets.length,
      },
      driver: {
        totalBalancePaise: totalDriverBalancePaise,
        activeDriversCount,
        blockedDriversCount,
        totalDriversWithWallets: driverWallets.length,
        owedToCompanyPaise,
        owedDriversCount,
        payableToDriversPaise,
        payableDriversCount,
        suspendedCount,
        driversWithActivityCount,
      },
      transactions: {
        totalVolumePaise,
        platformCommissionPaise,
        adjustmentsPaise,
        totalTransactionsCount: this.transactions.length,
      },
    };
  }

  async listWallets(
    query: ListWalletsQueryDto,
    lookups?: {
      getDrivers?: () => Promise<UserLookupItem[]>;
      getRiders?: () => Promise<UserLookupItem[]>;
    },
  ): Promise<{ items: WalletSummaryDto[]; total: number }> {
    const ownerType = query.type ?? 'DRIVER';
    const allWallets = Array.from(this.wallets.values()).filter(
      (w) => (w.ownerType ?? 'DRIVER') === ownerType,
    );

    // Compute stats from transactions
    const statsByOwner = new Map<
      string,
      { entriesCount: number; lastEntryDate: Date; lifetimeEarningsPaise: number }
    >();
    for (const tx of this.transactions) {
      const keys = [tx.walletId, tx.driverId, tx.riderId].filter(Boolean) as string[];
      for (const k of keys) {
        let entry = statsByOwner.get(k);
        if (!entry) {
          entry = { entriesCount: 0, lastEntryDate: tx.createdAt, lifetimeEarningsPaise: 0 };
          statsByOwner.set(k, entry);
        }
        entry.entriesCount += 1;
        if (tx.createdAt > entry.lastEntryDate) {
          entry.lastEntryDate = tx.createdAt;
        }
        if (tx.type === 'CREDIT') {
          entry.lifetimeEarningsPaise += tx.amountPaise;
        }
      }
    }

    const userMap = new Map<string, UserLookupItem>();
    if (ownerType === 'DRIVER' && lookups?.getDrivers) {
      const drivers = await lookups.getDrivers();
      for (const d of drivers) userMap.set(d.id, d);
    } else if (ownerType === 'RIDER' && lookups?.getRiders) {
      const riders = await lookups.getRiders();
      for (const r of riders) userMap.set(r.id, r);
    }

    let summaries: WalletSummaryDto[] = allWallets.map((w) => {
      const ownerId = (ownerType === 'RIDER' ? w.riderId : w.driverId) ?? w.id;
      const user = userMap.get(ownerId);
      const txStat =
        statsByOwner.get(w.id) ?? (w.driverId ? statsByOwner.get(w.driverId) : undefined);
      const isEligible = w.status === 'ACTIVE' && w.balancePaise > 0;
      const owed = w.balancePaise < 0 ? Math.abs(w.balancePaise) : (w.owedPaise ?? 0);
      const payable = w.balancePaise > 0 ? w.balancePaise : 0;
      const isSuspended = w.status === 'BLOCKED';

      return {
        id: w.id,
        ownerType,
        ownerId,
        name: user?.name ?? null,
        phoneE164: user?.phoneE164 ?? '',
        email: user?.email ?? null,
        vehicleNumber: user?.vehicleNumber ?? null,
        zoneName: user?.zoneName ?? null,
        isDispatchEligible: isEligible,
        balancePaise: w.balancePaise,
        spendableCreditPaise: w.balancePaise,
        owedAmountPaise: owed,
        owedToCompanyPaise: owed,
        payableToDriverPaise: payable,
        lifetimeEarningsPaise: txStat?.lifetimeEarningsPaise ?? 0,
        lastEntryDate: txStat?.lastEntryDate ? txStat.lastEntryDate.toISOString() : null,
        entriesCount: txStat?.entriesCount ?? 0,
        isSuspended,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      };
    });

    if (query.status === 'ACTIVE') {
      summaries = summaries.filter((s) => s.status === 'ACTIVE');
    } else if (query.status === 'BLOCKED') {
      summaries = summaries.filter((s) => s.balancePaise <= 0 || s.status === 'BLOCKED');
    } else if (query.status === 'OWED') {
      summaries = summaries.filter((s) => s.owedAmountPaise > 0);
    } else if (query.status === 'CREDIT') {
      summaries = summaries.filter((s) => s.balancePaise > 0);
    }

    // Apply balanceFilter
    if (query.balanceFilter && query.balanceFilter !== 'ALL') {
      if (query.balanceFilter === 'OWING') {
        summaries = summaries.filter((w) => (w.owedToCompanyPaise ?? 0) > 0);
      } else if (query.balanceFilter === 'PAYABLE') {
        summaries = summaries.filter((w) => (w.payableToDriverPaise ?? 0) > 0);
      } else if (query.balanceFilter === 'ZERO') {
        summaries = summaries.filter((w) => w.balancePaise === 0);
      }
    }

    // Apply suspendedFilter
    if (query.suspendedFilter && query.suspendedFilter !== 'ANY') {
      if (query.suspendedFilter === 'SUSPENDED') {
        summaries = summaries.filter((w) => w.isSuspended === true);
      } else if (query.suspendedFilter === 'NOT_SUSPENDED') {
        summaries = summaries.filter((w) => !w.isSuspended);
      }
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim().toLowerCase();
      summaries = summaries.filter(
        (w) =>
          (w.name && w.name.toLowerCase().includes(s)) ||
          w.phoneE164.includes(s) ||
          (w.vehicleNumber && w.vehicleNumber.toLowerCase().includes(s)) ||
          w.ownerId.toLowerCase().includes(s),
      );
    }

    // Apply sortBy
    const sortBy = query.sortBy ?? 'DEEPEST_DEBT';
    summaries.sort((a, b) => {
      switch (sortBy) {
        case 'DEEPEST_DEBT':
          return a.balancePaise - b.balancePaise;
        case 'HIGHEST_BALANCE':
          return b.balancePaise - a.balancePaise;
        case 'LIFETIME_EARNINGS':
          return (b.lifetimeEarningsPaise ?? 0) - (a.lifetimeEarningsPaise ?? 0);
        case 'RECENT_ENTRY':
          return (
            new Date(b.lastEntryDate ?? 0).getTime() - new Date(a.lastEntryDate ?? 0).getTime()
          );
        default:
          return 0;
      }
    });

    const total = summaries.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { items: summaries.slice(offset, offset + limit), total };
  }
}
