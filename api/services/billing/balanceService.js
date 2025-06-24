const mongoose = require('mongoose');
const { User, Transaction } = require('~/db/models');

/**
 * Держим баланс в поле `User.balance` – оно уже есть в стандартной схеме
 * (если в вашей версии LibreChat его нет, добавьте `balance: { type:Number, default:0 }`
 *  в пользовательскую миграцию).
 */
const balanceService = {
  /** Текущий баланс (в логических «кредитах») */
  async getBalance(userId) {
    const user = await User.findById(userId).select('balance').lean();
    return user?.balance ?? 0;
  },

  /** Есть ли нужная сумма? */
  async hasEnough(userId, need) {
    return (await this.getBalance(userId)) >= need;
  },

  /**
   * Атомарно меняем баланс и записываем транзакцию.
   * @param {'usage'|'topup'|'adjust'} type
   */
  async changeBalance(userId, credits, { type, ...meta }) {
    if (!credits) return;

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: credits } },
      { new: true }, // убрали session
    ).select('balance');

    if (!user || user.balance < 0) {
      // Откат обновления, если баланс стал < 0
      await User.findByIdAndUpdate(userId, { $inc: { balance: -credits } });
      throw new Error('INSUFFICIENT_CREDITS');
    }

    // просто создаём транзакцию без session
    await Transaction.create({ userId, type, credits, ...meta });
  },

  /** Пополнение */
  async addBalance(userId, credits, meta = {}) {
    if (credits <= 0) throw new Error('credits must be > 0');
    await this.changeBalance(userId, credits, { type: 'topup', ...meta });
  },

  /** Списание */
  async spendCredits(userId, credits, meta = {}) {
    if (credits <= 0) return;
    await this.changeBalance(userId, -credits, { type: 'usage', ...meta });
  },
};

module.exports = { balanceService };
