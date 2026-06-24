// get data from kv
export const getKV = async (KV, key, type = "json") => {
    try {
        return await KV.get(key, { type });
    } catch (error) {
        console.error(`[KV Get Error] Key: ${key} -`, error.message);
        return null;
    }
};

// set data to kv
export const setKV = async (KV, key, data, ttl = 604800) => {
    try {
        const value = typeof data === "string" ? data : JSON.stringify(data);
        const options = ttl > 0 ? { expirationTtl: ttl } : {};

        await KV.put(key, value, options);
    } catch (error) {
        console.error(`[KV Put Error] Key: ${key} -`, error.message);
    }
};

// delete data from kv
export const deleteKV = async (KV, key) => {
    try {
        await KV.delete(key);
    } catch (error) {
        console.error(`[KV Delete Error] Key: ${key} -`, error.message);
    }
};
