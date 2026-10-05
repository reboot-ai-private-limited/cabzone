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
import { WalletModel, type WalletDocument } from './wallet.model.js';
import {
  WalletTransactionModel,
  type WalletTransactionDocument,
} from './walletTransaction.model.js';

export class MongoWalletRepository implements WalletRepositoryPort {
  async findByDriverId(driverId: string): Promise<WalletEntity | null> {
    const doc = await WalletModel.findOne({ driver_id: driverId })
      .lean<WalletDocument | null>()
      .exec();
    return doc ? this.toWallet(doc) : null;
  }

  async findByRiderId(riderId: string): Promise<WalletEntity | null> {
    const doc = await WalletModel.findOne({ rider_id: riderId })
      .lean<WalletDocument | null>()
      .exec();
    return doc ? this.toWallet(doc) : null;
  }

  async findById(id: string): Promise<WalletEntity | null> {
    const doc = await WalletModel.findById(id).lean<WalletDocument | null>().exec();
    return doc ? this.toWallet(doc) : null;
  }

  async save(wallet: WalletEntity): Promise<WalletEntity> {
    const doc = await WalletModel.findByIdAndUpdate(
      wallet.id,
      {
        _id: wallet.id,
        owner_type: wallet.ownerType ?? (wallet.riderId ? 'RIDER' : 'DRIVER'),
        driver_id: wallet.driverId || null,
        rider_id: wallet.riderId || null,
        balance_paise: wallet.balancePaise,
        owed_paise: wallet.owedPaise ?? 0,
        status: wallet.status,
        version: wallet.version,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<WalletDocument>()
      .exec();
    return this.toWallet(doc);
  }

  async recordTransaction(
    transaction: WalletTransactionEntity,
  ): Promise<WalletTransactionEntity> {
    const created = await WalletTransactionModel.create({
      _id: transaction.id,
      wallet_id: transaction.walletId,
      owner_type: transaction.ownerType ?? (transaction.riderId ? 'RIDER' : 'DRIVER'),
      driver_id: transaction.driverId ?? null,
      rider_id: transaction.riderId ?? null,
      type: transaction.type,
      amount_paise: transaction.amountPaise,
      reference_type: transaction.referenceType,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      balance_before_paise: transaction.balanceBeforePaise,
      balance_after_paise: transaction.balanceAfterPaise,
      created_by: transaction.createdBy,
      note: transaction.note ?? null,
      created_at: transaction.createdAt,
    });
    return this.toTransaction(created.toObject() as WalletTransactionDocument);
  }

  async findTransactionsByWalletId(walletId: string): Promise<WalletTransactionEntity[]> {
    const docs = await WalletTransactionModel.find({ wallet_id: walletId })
      .sort({ created_at: -1 })
      .lean<WalletTransactionDocument[]>()
      .exec();
    return docs.map((d) => this.toTransaction(d));
  }

  async listTransactions(
    query: ListTransactionsQueryDto,
  ): Promise<{ items: WalletTransactionDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.walletId) filter.wallet_id = query.walletId;
    if (query.driverId) filter.driver_id = query.driverId;
    if (query.riderId) filter.rider_id = query.riderId;
    if (query.ownerType) filter.owner_type = query.ownerType;
    if (query.type) filter.type = query.type;
    if (query.referenceType) filter.reference_type = query.referenceType;

    if (query.search && query.search.trim()) {
      const s = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(s, 'i');
      filter.$or = [{ note: reg }, { reference_id: reg }, { _id: reg }];
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [total, docs] = await Promise.all([
      WalletTransactionModel.countDocuments(filter),
      WalletTransactionModel.find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean<WalletTransactionDocument[]>()
        .exec(),
    ]);

    const items: WalletTransactionDto[] = docs.map((d) => ({
      id: d._id,
      walletId: d.wallet_id,
      ownerType: d.owner_type,
      driverId: d.driver_id,
      riderId: d.rider_id,
      type: d.type,
      amountPaise: d.amount_paise,
      referenceType: d.reference_type,
      referenceId: d.reference_id,
      idempotencyKey: d.idempotency_key,
      balanceBeforePaise: d.balance_before_paise,
      balanceAfterPaise: d.balance_after_paise,
      createdBy: d.created_by,
      note: d.note ?? null,
      createdAt: d.created_at.toISOString(),
    }));

    return { items, total };
  }

  async getStats(): Promise<FinanceStatsDto> {
    const [wallets, transactions] = await Promise.all([
      WalletModel.find({}).lean<WalletDocument[]>().exec(),
      WalletTransactionModel.find({}).lean<WalletTransactionDocument[]>().exec(),
    ]);

    const customerWallets = wallets.filter((w) => w.owner_type === 'RIDER');
    const driverWallets = wallets.filter((w) => w.owner_type !== 'RIDER');

    // Customer KPIs
    let creditOutstandingPaise = 0;
    let creditCustomersCount = 0;
    let owedByCustomersPaise = 0;
    let owedCustomersCount = 0;

    for (const cw of customerWallets) {
      if (cw.balance_paise > 0) {
        creditOutstandingPaise += cw.balance_paise;
        creditCustomersCount += 1;
      }
      if (cw.owed_paise > 0) {
        owedByCustomersPaise += cw.owed_paise;
        owedCustomersCount += 1;
      }
    }

    // Driver KPIs
    let totalDriverBalancePaise = 0;
    let activeDriversCount = 0;
    let blockedDriversCount = 0;
    let owedToCompanyPaise = 0;
    let owedDriversCount = 0;
    let payableToDriversPaise = 0;
    let payableDriversCount = 0;
    let suspendedCount = 0;

    for (const dw of driverWallets) {
      if (dw.balance_paise > 0) {
        totalDriverBalancePaise += dw.balance_paise;
        payableToDriversPaise += dw.balance_paise;
        payableDriversCount += 1;
      }
      if (dw.balance_paise < 0 || (dw.owed_paise ?? 0) > 0) {
        const owed = dw.balance_paise < 0 ? Math.abs(dw.balance_paise) : (dw.owed_paise ?? 0);
        owedToCompanyPaise += owed;
        owedDriversCount += 1;
      }
      if (dw.status === 'BLOCKED') {
        suspendedCount += 1;
      }
      if (dw.status === 'ACTIVE' && dw.balance_paise > 0) {
        activeDriversCount += 1;
      } else {
        blockedDriversCount += 1;
      }
    }

    const driverIdsWithTx = new Set<string>();
    const walletToDriver = new Map<string, string>();
    for (const w of driverWallets) {
      if (w.driver_id) walletToDriver.set(w._id, w.driver_id);
    }
    for (const tx of transactions) {
      if (tx.driver_id) {
        driverIdsWithTx.add(tx.driver_id);
      } else if (tx.wallet_id && walletToDriver.has(tx.wallet_id)) {
        driverIdsWithTx.add(walletToDriver.get(tx.wallet_id)!);
      }
    }
    const driversWithActivityCount = driverIdsWithTx.size;

    // Transaction KPIs
    let totalVolumePaise = 0;
    let platformCommissionPaise = 0;
    let adjustmentsPaise = 0;

    for (const tx of transactions) {
      totalVolumePaise += tx.amount_paise;
      if (tx.reference_type === 'RIDE_COMMISSION') {
        platformCommissionPaise += tx.amount_paise;
      }
      if (tx.reference_type === 'ADMIN_ADJUSTMENT') {
        adjustmentsPaise += tx.type === 'CREDIT' ? tx.amount_paise : -tx.amount_paise;
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
        totalTransactionsCount: transactions.length,
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
    const filter: Record<string, unknown> = {
      owner_type: ownerType,
    };

    if (query.status === 'ACTIVE') {
      filter.status = 'ACTIVE';
    } else if (query.status === 'BLOCKED') {
      filter.$or = [{ status: 'BLOCKED' }, { balance_paise: { $lte: 0 } }];
    } else if (query.status === 'OWED') {
      filter.owed_paise = { $gt: 0 };
    } else if (query.status === 'CREDIT') {
      filter.balance_paise = { $gt: 0 };
    }

    const docs = await WalletModel.find(filter)
      .sort({ updated_at: -1 })
      .lean<WalletDocument[]>()
      .exec();

    // Fetch transactions to compute lifetime earnings, last entry, and entry count
    const txDocs = await WalletTransactionModel.find({}).lean<WalletTransactionDocument[]>().exec();
    const statsByOwner = new Map<string, { entriesCount: number; lastEntryDate: Date; lifetimeEarningsPaise: number }>();

    for (const tx of txDocs) {
      const keys = [tx.wallet_id, tx.driver_id, tx.rider_id].filter(Boolean) as string[];
      for (const k of keys) {
        let entry = statsByOwner.get(k);
        if (!entry) {
          entry = { entriesCount: 0, lastEntryDate: tx.created_at, lifetimeEarningsPaise: 0 };
          statsByOwner.set(k, entry);
        }
        entry.entriesCount += 1;
        if (tx.created_at > entry.lastEntryDate) {
          entry.lastEntryDate = tx.created_at;
        }
        if (tx.type === 'CREDIT') {
          entry.lifetimeEarningsPaise += tx.amount_paise;
        }
      }
    }

    // Fetch user details from lookups
    const userMap = new Map<string, UserLookupItem>();
    if (ownerType === 'DRIVER' && lookups?.getDrivers) {
      const drivers = await lookups.getDrivers();
      for (const d of drivers) userMap.set(d.id, d);
    } else if (ownerType === 'RIDER' && lookups?.getRiders) {
      const riders = await lookups.getRiders();
      for (const r of riders) userMap.set(r.id, r);
    }

    let summaries: WalletSummaryDto[] = docs.map((doc) => {
      const ownerId = (ownerType === 'RIDER' ? doc.rider_id : doc.driver_id) ?? doc._id;
      const user = userMap.get(ownerId);
      const txStat = statsByOwner.get(doc._id) ?? (doc.driver_id ? statsByOwner.get(doc.driver_id) : undefined);
      const isEligible = doc.status === 'ACTIVE' && doc.balance_paise > 0;
      const owed = doc.balance_paise < 0 ? Math.abs(doc.balance_paise) : (doc.owed_paise ?? 0);
      const payable = doc.balance_paise > 0 ? doc.balance_paise : 0;
      const isSuspended = doc.status === 'BLOCKED';

      return {
        id: doc._id,
        ownerType,
        ownerId,
        name: user?.name ?? null,
        phoneE164: user?.phoneE164 ?? '',
        email: user?.email ?? null,
        vehicleNumber: user?.vehicleNumber ?? null,
        zoneName: user?.zoneName ?? null,
        isDispatchEligible: isEligible,
        balancePaise: doc.balance_paise,
        spendableCreditPaise: doc.balance_paise,
        owedAmountPaise: owed,
        owedToCompanyPaise: owed,
        payableToDriverPaise: payable,
        lifetimeEarningsPaise: txStat?.lifetimeEarningsPaise ?? 0,
        lastEntryDate: txStat?.lastEntryDate ? txStat.lastEntryDate.toISOString() : null,
        entriesCount: txStat?.entriesCount ?? 0,
        isSuspended,
        status: doc.status,
        createdAt: doc.created_at.toISOString(),
        updatedAt: doc.updated_at.toISOString(),
      };
    });

    // Also include users who do not yet have a wallet document in MongoDB if browsing all
    if (!query.status || query.status === 'ALL') {
      const existingOwnerIds = new Set(docs.map((d) => (ownerType === 'RIDER' ? d.rider_id : d.driver_id)));
      for (const [userId, user] of userMap.entries()) {
        if (!existingOwnerIds.has(userId)) {
          summaries.push({
            id: `virtual-${userId}`,
            ownerType,
            ownerId: userId,
            name: user.name,
            phoneE164: user.phoneE164,
            email: user.email ?? null,
            vehicleNumber: user.vehicleNumber ?? null,
            zoneName: user.zoneName ?? null,
            isDispatchEligible: false,
            balancePaise: 0,
            spendableCreditPaise: 0,
            owedAmountPaise: 0,
            owedToCompanyPaise: 0,
            payableToDriverPaise: 0,
            lifetimeEarningsPaise: 0,
            lastEntryDate: null,
            entriesCount: 0,
            isSuspended: false,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
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

    // Apply search filter on name / phone
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
          return new Date(b.lastEntryDate ?? 0).getTime() - new Date(a.lastEntryDate ?? 0).getTime();
        default:
          return 0;
      }
    });

    const total = summaries.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const paginated = summaries.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  private toWallet(doc: WalletDocument): WalletEntity {
    return {
      id: doc._id,
      ownerType: doc.owner_type,
      driverId: doc.driver_id ?? '',
      riderId: doc.rider_id ?? null,
      balancePaise: doc.balance_paise,
      owedPaise: doc.owed_paise ?? 0,
      status: doc.status,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }

  private toTransaction(doc: WalletTransactionDocument): WalletTransactionEntity {
    return {
      id: doc._id,
      walletId: doc.wallet_id,
      ownerType: doc.owner_type,
      driverId: doc.driver_id,
      riderId: doc.rider_id,
      type: doc.type,
      amountPaise: doc.amount_paise,
      referenceType: doc.reference_type,
      referenceId: doc.reference_id,
      idempotencyKey: doc.idempotency_key,
      balanceBeforePaise: doc.balance_before_paise,
      balanceAfterPaise: doc.balance_after_paise,
      createdBy: doc.created_by,
      note: doc.note ?? null,
      createdAt: doc.created_at,
    };
  }
}
