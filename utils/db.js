/**
 * utils/db.js
 * Official native MongoDB driver (v7.9.0 / v6.15+) connection & collection query layer.
 * 100% Cloudflare Workers compatible via nodejs_compat + cloudflare:sockets.
 * Replaces Mongoose TCP models with native collection queries.
 */
const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let dbInstance = null;

function getClient() {
  if (client) return client;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('[MongoDB] Error: MONGODB_URI is not defined in environment.');

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000
  });

  return client;
}

async function getDb() {
  if (dbInstance) return dbInstance;
  const c = getClient();
  await c.connect();
  dbInstance = c.db();
  return dbInstance;
}

async function connectDB() {
  const db = await getDb();
  console.log('✅ [MongoDB Native Driver] Connected successfully');
  return db;
}

function toObjectId(id) {
  if (!id) return id;
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
    try {
      return new ObjectId(id);
    } catch (e) {
      return id;
    }
  }
  return id;
}

function wrapDoc(doc, collectionName) {
  if (!doc || typeof doc !== 'object') return doc;

  // Add document .save() method
  Object.defineProperty(doc, 'save', {
    enumerable: false,
    writable: true,
    value: async function() {
      const db = await getDb();
      const col = db.collection(collectionName);
      if (this._id) {
        const updateDoc = { ...this };
        delete updateDoc._id;
        delete updateDoc.save;
        await col.updateOne({ _id: toObjectId(this._id) }, { $set: updateDoc });
      } else {
        const res = await col.insertOne(this);
        this._id = res.insertedId;
      }
      return this;
    }
  });

  return doc;
}

class QueryChain {
  constructor(collectionName, filter, projection) {
    this.collectionName = collectionName;
    this.filter = filter || {};
    this.projection = projection;
    this.sortOptions = null;
    this.limitNum = null;
    this.skipNum = null;
  }

  sort(s) {
    this.sortOptions = s;
    return this;
  }

  limit(l) {
    this.limitNum = typeof l === 'number' ? l : parseInt(l) || null;
    return this;
  }

  skip(k) {
    this.skipNum = typeof k === 'number' ? k : parseInt(k) || null;
    return this;
  }

  lean() {
    return this;
  }

  populate() {
    return this;
  }

  select(sel) {
    if (typeof sel === 'string') {
      const proj = {};
      sel.split(' ').forEach(field => {
        if (field.startsWith('-')) {
          proj[field.slice(1)] = 0;
        } else if (field) {
          proj[field] = 1;
        }
      });
      this.projection = { ...(this.projection || {}), ...proj };
    }
    return this;
  }

  async toArray() {
    const db = await getDb();
    const col = db.collection(this.collectionName);

    // Normalize _id in filter
    if (this.filter && this.filter._id) {
      if (typeof this.filter._id === 'string') {
        this.filter._id = toObjectId(this.filter._id);
      } else if (this.filter._id.$in && Array.isArray(this.filter._id.$in)) {
        this.filter._id.$in = this.filter._id.$in.map(toObjectId);
      }
    }

    let cursor = col.find(this.filter, this.projection ? { projection: this.projection } : {});
    if (this.sortOptions) cursor = cursor.sort(this.sortOptions);
    if (this.skipNum) cursor = cursor.skip(this.skipNum);
    if (this.limitNum) cursor = cursor.limit(this.limitNum);

    const docs = await cursor.toArray();
    return docs.map(d => wrapDoc(d, this.collectionName));
  }

  then(resolve, reject) {
    return this.toArray().then(resolve, reject);
  }

  catch(reject) {
    return this.toArray().catch(reject);
  }
}

function createModel(collectionName, defaultData = {}) {
  // Support `new Model(data)` constructor syntax
  function ModelConstructor(data = {}) {
    const instance = { ...defaultData, ...data };
    return wrapDoc(instance, collectionName);
  }

  ModelConstructor.collectionName = collectionName;
  ModelConstructor.toObjectId = toObjectId;

  ModelConstructor.getCollection = async function() {
    const db = await getDb();
    return db.collection(collectionName);
  };

  ModelConstructor.find = function(filter = {}, projection) {
    return new QueryChain(collectionName, filter, projection);
  };

  ModelConstructor.findOne = async function(filter = {}, projection) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const query = { ...filter };
    if (query._id) query._id = toObjectId(query._id);
    const doc = await col.findOne(query, projection ? { projection } : {});
    return wrapDoc(doc, collectionName);
  };

  ModelConstructor.findById = async function(id, projection) {
    if (!id) return null;
    return ModelConstructor.findOne({ _id: toObjectId(id) }, projection);
  };

  ModelConstructor.findByIdAndUpdate = async function(id, update, options = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const _id = toObjectId(id);
    const updatePayload = update.$set || update.$addToSet || update.$pull || update.$inc ? update : { $set: update };
    const res = await col.findOneAndUpdate(
      { _id },
      updatePayload,
      { returnDocument: options.new !== false ? 'after' : 'before' }
    );
    const doc = res && res.value !== undefined ? res.value : res;
    return wrapDoc(doc, collectionName);
  };

  ModelConstructor.findOneAndUpdate = async function(filter, update, options = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const query = { ...filter };
    if (query._id) query._id = toObjectId(query._id);
    const updatePayload = update.$set || update.$addToSet || update.$pull || update.$inc ? update : { $set: update };
    const res = await col.findOneAndUpdate(
      query,
      updatePayload,
      {
        returnDocument: options.new !== false ? 'after' : 'before',
        upsert: Boolean(options.upsert)
      }
    );
    const doc = res && res.value !== undefined ? res.value : res;
    return wrapDoc(doc, collectionName);
  };

  ModelConstructor.findByIdAndDelete = async function(id) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const res = await col.findOneAndDelete({ _id: toObjectId(id) });
    return res && res.value !== undefined ? res.value : res;
  };

  ModelConstructor.findOneAndDelete = async function(filter) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const query = { ...filter };
    if (query._id) query._id = toObjectId(query._id);
    const res = await col.findOneAndDelete(query);
    return res && res.value !== undefined ? res.value : res;
  };

  ModelConstructor.create = async function(data) {
    const db = await getDb();
    const col = db.collection(collectionName);
    if (Array.isArray(data)) {
      const res = await col.insertMany(data);
      return data.map((d, i) => wrapDoc({ ...d, _id: res.insertedIds[i] }, collectionName));
    }
    const doc = { ...defaultData, ...data };
    const res = await col.insertOne(doc);
    doc._id = res.insertedId;
    return wrapDoc(doc, collectionName);
  };

  ModelConstructor.insertOne = async function(data) {
    return ModelConstructor.create(data);
  };

  ModelConstructor.insertMany = async function(data) {
    return ModelConstructor.create(data);
  };

  ModelConstructor.updateOne = async function(filter, update, options = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const query = { ...filter };
    if (query._id) query._id = toObjectId(query._id);
    const updatePayload = update.$set || update.$addToSet || update.$pull || update.$inc ? update : { $set: update };
    return col.updateOne(query, updatePayload, options);
  };

  ModelConstructor.updateMany = async function(filter, update, options = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const updatePayload = update.$set || update.$addToSet || update.$pull || update.$inc ? update : { $set: update };
    return col.updateMany(filter, updatePayload, options);
  };

  ModelConstructor.deleteOne = async function(filter) {
    const db = await getDb();
    const col = db.collection(collectionName);
    const query = { ...filter };
    if (query._id) query._id = toObjectId(query._id);
    return col.deleteOne(query);
  };

  ModelConstructor.deleteMany = async function(filter = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    return col.deleteMany(filter);
  };

  ModelConstructor.countDocuments = async function(filter = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    return col.countDocuments(filter);
  };

  ModelConstructor.distinct = async function(field, filter = {}) {
    const db = await getDb();
    const col = db.collection(collectionName);
    return col.distinct(field, filter);
  };

  ModelConstructor.aggregate = function(pipeline = []) {
    return {
      async toArray() {
        const db = await getDb();
        const col = db.collection(collectionName);
        return col.aggregate(pipeline).toArray();
      },
      then(resolve, reject) {
        return this.toArray().then(resolve, reject);
      }
    };
  };

  return ModelConstructor;
}

module.exports = {
  getClient,
  getDb,
  connectDB,
  createModel,
  toObjectId,
  ObjectId
};
