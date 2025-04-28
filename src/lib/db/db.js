console.log('✅ db.js loaded');

const fakeDb = {
  async query(sql) {
    console.log(`✅ Fake query received: ${sql}`);
    return { rows: [] };
  }
};

export default fakeDb;