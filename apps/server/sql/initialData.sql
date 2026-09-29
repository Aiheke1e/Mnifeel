begin;

-- schema.sql 已包含当前全部结构；登记迁移后，应用启动时不会重复建表。
insert into "schemaMigrations" ("name")
values ('initialSchema'), ('authRateLimits')
on conflict ("name") do nothing;

-- 管理员密码必须由 Bun 使用 Argon2id 生成哈希，首次启动时由服务根据环境变量安全创建。

commit;
