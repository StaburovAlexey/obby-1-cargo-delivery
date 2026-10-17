import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export function createVkPurchaseStore(path){
  if(!path||path===':memory:')throw new Error('VK purchases require a persistent database path');
  const file=resolve(path);mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const database=new DatabaseSync(file);chmodSync(file,0o600);
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS vk_orders (
      id INTEGER PRIMARY KEY, app_id TEXT NOT NULL, mode TEXT NOT NULL,
      order_id TEXT NOT NULL, user_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
      product_id TEXT NOT NULL, status TEXT NOT NULL, votes INTEGER NOT NULL,
      UNIQUE(app_id,mode,order_id)
    ) STRICT;`);
  const find=database.prepare('SELECT * FROM vk_orders WHERE app_id=? AND mode=? AND order_id=?');
  const insert=database.prepare('INSERT INTO vk_orders(app_id,mode,order_id,user_id,receiver_id,product_id,status,votes) VALUES(?,?,?,?,?,?,?,?)');
  const refund=database.prepare("UPDATE vk_orders SET status='refunded' WHERE id=?");
  const owned=database.prepare("SELECT DISTINCT product_id FROM vk_orders WHERE app_id=? AND mode=? AND receiver_id=? AND status='chargeable' ORDER BY product_id");
  let closed=false;
  return {
    apply({appId,mode,orderId,userId,receiverId,productId,status,votes}){
      database.exec('BEGIN IMMEDIATE');
      try{
        let row=find.get(appId,mode,orderId);
        if(row){
          if(row.user_id!==userId||row.receiver_id!==receiverId||row.product_id!==productId)throw new Error('VK order identity mismatch');
          if(status==='refunded'&&row.status!=='refunded')refund.run(row.id);
        }else{
          const result=insert.run(appId,mode,orderId,userId,receiverId,productId,status,votes);
          row={id:Number(result.lastInsertRowid)};
        }
        database.exec('COMMIT');return row.id;
      }catch(error){database.exec('ROLLBACK');throw error;}
    },
    purchases(appId,mode,userId){return owned.all(appId,mode,userId).map(row=>({productID:row.product_id}));},
    close(){if(!closed){closed=true;database.close();}},
  };
}
