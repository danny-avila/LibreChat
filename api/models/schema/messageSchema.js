const mongoose = require('mongoose');
const { encrypt, decrypt } = require('~/server/utils/encryptionUtil');
const mongoMeili = require('~/models/plugins/mongoMeili');
const messageSchema = mongoose.Schema(
  {
    messageId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    conversationId: {
      type: String,
      index: true,
      required: true,
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
      required: true,
      default: null,
    },
    model: {
      type: String,
      default: null,
    },
    endpoint: {
      type: String,
    },
    conversationSignature: {
      type: String,
    },
    clientId: {
      type: String,
    },
    invocationId: {
      type: Number,
    },
    parentMessageId: {
      type: String,
    },
    tokenCount: {
      type: Number,
    },
    summaryTokenCount: {
      type: Number,
    },
    sender: {
      type: String,
      meiliIndex: true,
    },
    text: {
      type: String,
      meiliIndex: true,
    },
    summary: {
      type: String,
    },
    isCreatedByUser: {
      type: Boolean,
      required: true,
      default: false,
    },
    unfinished: {
      type: Boolean,
      default: false,
    },
    error: {
      type: Boolean,
      default: false,
    },
    finish_reason: {
      type: String,
    },
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
    files: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    plugin: {
      type: {
        latest: {
          type: String,
          required: false,
        },
        inputs: {
          type: [mongoose.Schema.Types.Mixed],
          required: false,
          default: undefined,
        },
        outputs: {
          type: String,
          required: false,
        },
      },
      default: undefined,
    },
    plugins: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    content: {
      type: [{ type: mongoose.Schema.Types.Mixed }],
      default: undefined,
      meiliIndex: true,
    },
    thread_id: {
      type: String,
    },
    /* frontend components */
    iconURL: {
      type: String,
    },
    attachments: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /*
    attachments: {
      type: [
        {
          file_id: String,
          filename: String,
          filepath: String,
          expiresAt: Date,
          width: Number,
          height: Number,
          type: String,
          conversationId: String,
          messageId: {
            type: String,
            required: true,
          },
          toolCallId: String,
        },
      ],
      default: undefined,
    },
    */
    expiredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

messageSchema.statics.getEncryptionKey = function () {
  return this.getOptions()?.encryptionKey;
};

messageSchema.pre('save', function (next) {
  const encryptionKey = this.constructor.getEncryptionKey();
  if (!encryptionKey) {
    return next();
  }

  try {
    if (this.text) {
      this.text = encrypt(this.text, encryptionKey);
    }
    if (this.content) {
      this.content = this.content.map((item) => {
        if (item.text) {
          return { ...item, text: encrypt(item.text, encryptionKey) };
        }
        return item;
      });
    }
    if (this.summary) {
      this.summary = encrypt(this.summary, encryptionKey);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Post-find middleware to decrypt data
messageSchema.post('find', function (docs) {
  const encryptionKey = this.getOptions()?.encryptionKey;
  if (!docs || !encryptionKey) {
    return;
  }

  docs.forEach((doc) => {
    if (!doc) {
      return;
    }

    try {
      const isPlainObject = !doc.toObject;

      if (doc.text) {
        if (isPlainObject) {
          doc.text = decrypt(doc.text, encryptionKey);
        } else {
          doc.text = decrypt(doc.text, encryptionKey);
          doc.markModified('text');
        }
      }
      if (doc.content) {
        doc.content = doc.content.map((item) => {
          if (item.text) {
            return { ...item, text: decrypt(item.text, encryptionKey) };
          }
          return item;
        });
        if (!isPlainObject) {
          doc.markModified('content');
        }
      }
    } catch (error) {
      console.error('Decryption error:', error);
    }
  });
});

messageSchema.post('findOne', function (doc) {
  const encryptionKey = this.getOptions()?.encryptionKey;
  if (!doc || !encryptionKey) {
    return;
  }

  try {
    if (doc.text) {
      doc.text = decrypt(doc.text, encryptionKey);
    }
    if (doc.content) {
      doc.content = doc.content.map((item) => {
        if (item.text) {
          return { ...item, text: decrypt(item.text, encryptionKey) };
        }
        return item;
      });
    }
  } catch (error) {
    console.error('Decryption error:', error);
  }
});

messageSchema.pre('findOneAndUpdate', function (next) {
  const encryptionKey = this.getOptions()?.encryptionKey;
  if (!encryptionKey) {
    return next();
  }

  try {
    const update = this.getUpdate();
    if (update.text) {
      update.text = encrypt(update.text, encryptionKey);
    }
    if (update.content) {
      update.content = update.content.map((item) => {
        if (item.text) {
          return { ...item, text: encrypt(item.text, encryptionKey) };
        }
        return item;
      });
    }
    next();
  } catch (error) {
    next(error);
  }
});

messageSchema.pre('updateOne', function (next) {
  const encryptionKey = this.getOptions()?.encryptionKey;
  if (!encryptionKey) {
    return next();
  }

  try {
    const update = this.getUpdate();
    if (update.text) {
      update.text = encrypt(update.text, encryptionKey);
    }
    if (update.content) {
      update.content = update.content.map((item) => {
        if (item.text) {
          return { ...item, text: encrypt(item.text, encryptionKey) };
        }
        return item;
      });
    }
    next();
  } catch (error) {
    next(error);
  }
});

messageSchema.pre('bulkWrite', function (next) {
  const encryptionKey = this.getOptions()?.encryptionKey;
  if (!encryptionKey) {
    return next();
  }

  try {
    const operations = this.getOperations();
    operations.forEach((op) => {
      if (op.updateOne && op.updateOne.update) {
        const update = op.updateOne.update;
        if (update.text) {
          update.text = encrypt(update.text, encryptionKey);
        }
        if (update.content) {
          update.content = update.content.map((item) => {
            if (item.text) {
              return { ...item, text: encrypt(item.text, encryptionKey) };
            }
            return item;
          });
        }
      }
    });
    next();
  } catch (error) {
    next(error);
  }
});

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  messageSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'messages',
    primaryKey: 'messageId',
  });
}
messageSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ messageId: 1, user: 1 }, { unique: true });

/** @type {mongoose.Model<TMessage>} */
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;