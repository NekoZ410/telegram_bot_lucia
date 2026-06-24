// execute sql statement
export const executeDB = async (db, sql, params = []) => {
    try {
        let stmt = db.prepare(sql);
        if (params.length > 0) stmt = stmt.bind(...params);
        return await stmt.run();
    } catch (error) {
        console.error("[D1 Execute Error]:", error.message, "\nSQL:", sql);
        return null;
    }
};

// query 1 row
export const queryFirstDB = async (db, sql, params = []) => {
    try {
        let stmt = db.prepare(sql);
        if (params.length > 0) stmt = stmt.bind(...params);
        return await stmt.first();
    } catch (error) {
        console.error("[D1 Query First Error]:", error.message, "\nSQL:", sql);
        return null;
    }
};

// query all rows
export const queryAllDB = async (db, sql, params = []) => {
    try {
        let stmt = db.prepare(sql);
        if (params.length > 0) stmt = stmt.bind(...params);
        const { results } = await stmt.all();
        return results;
    } catch (error) {
        console.error("[D1 Query All Error]:", error.message, "\nSQL:", sql);
        return [];
    }
};
