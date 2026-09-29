begin;

-- schema.sql 已包含当前全部结构；登记迁移后，应用启动时不会重复建表。
insert into "schemaMigrations" ("name")
values ('initialSchema'), ('authRateLimits')
on conflict ("name") do nothing;

-- 演示账号密码由 Bun 使用 Argon2id 生成。按手机号更新现有账号，避免破坏线上已有项目和积分关联。
do $dml$
declare
  account record;
  accountUserId uuid;
begin
  for account in
    select * from (values
      ('875fe4e6-c006-4fdc-9ed5-4b4341f925b9'::uuid, '+8613800000000', 'admin', '$argon2id$v=19$m=65536,t=2,p=1$b+NurMIEDn8r1n6Cym2zTgBEd65sbyKKn3jHEM00tBo$O3pHepnL0Zfk/QvN+xyC+XYLxS0SLzx2wfPjNkjVu0E'),
      ('23d63998-183d-457c-b85d-c067f781f4e2'::uuid, '+8613900000000', 'user', '$argon2id$v=19$m=65536,t=2,p=1$N184XJv8KwSnvniF+PzoL+lF4MUbqCdm44eRFDnQbqA$DczX9suQYOVsIqcGTyeAlypokmW9zK/pC0ym48Kkx4U'),
      ('9a117da2-6baf-4cde-99f5-dd8e978767d0'::uuid, '+8618800001001', 'user', '$argon2id$v=19$m=65536,t=2,p=1$McxyczOCJxTz+O4ZMmBziLUF13EeYPvMRhpvemEw5UM$dLbGXei+0+G+NT8MfnOrDouDv+4+q/L2SyMxl9hZZWc'),
      ('4ed8265b-00f4-45e2-8a09-d2efee9291d4'::uuid, '+8618800001002', 'user', '$argon2id$v=19$m=65536,t=2,p=1$vEplAMVn5+A9jAv9BCFknYJz+GpMEFjd5ngfQFbd9tA$vV0lszsstzHwIDoMcfkEQIk/H0xgyEWHj2yp7accgvE'),
      ('ab380d73-66c8-49cb-90dd-2892ff071771'::uuid, '+8618800001003', 'user', '$argon2id$v=19$m=65536,t=2,p=1$1xXEfC0EVjDBF1rzKzE4l9qMd7D5XmVrS1JkTr0GZas$Zl0TioqiL9ukvHxGoE+bg410+Li4H1/f9TrOHLw9ujM')
    ) as accounts("id", "phone", "role", "passwordHash")
  loop
    select "userId" into accountUserId
    from "userIdentities"
    where "type" = 'phone' and "identifier" = account."phone"
    limit 1;

    if accountUserId is null then
      accountUserId := account."id";
      insert into "users" ("id", "role", "status", "isWhitelist", "passwordHash")
      values (accountUserId, account."role", 'active', false, account."passwordHash");
      insert into "userIdentities" ("id", "userId", "type", "identifier", "verifiedAt")
      values (gen_random_uuid(), accountUserId, 'phone', account."phone", now());
    else
      update "users" set
        "role" = account."role",
        "status" = 'active',
        "isWhitelist" = false,
        "passwordHash" = account."passwordHash",
        "updatedAt" = now()
      where "id" = accountUserId;
    end if;

    insert into "creditAccounts" ("userId", "availableCredits")
    values (accountUserId, case when account."role" = 'user' then 100 else 0 end)
    on conflict ("userId") do nothing;
  end loop;
end
$dml$;

commit;
