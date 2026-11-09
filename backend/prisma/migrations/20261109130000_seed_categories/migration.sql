INSERT INTO "categories" ("slug", "name", "enabled") VALUES
    ('rust', 'Smart contracts', true),
    ('fe', 'Front-end', true),
    ('tests', 'Tests', true),
    ('scripts', 'Scripts', true)
ON CONFLICT ("slug") DO NOTHING;
