-- Backfill normalized genres for catalog games known at the time genre
-- filtering was introduced. Match stable ROM filenames instead of titles or
-- environment-specific UUIDs, and preserve any genre already chosen by a
-- curator.

UPDATE public.games AS games
SET genre_slug = genre_map.genre_slug
FROM (
  VALUES
    -- Current rights-cleared catalog.
    ('Alien-Invasion.gb', 'action'),
    ('BeatBeast_jam.gba', 'shooter'),
    ('brekstascat_1_3.gb', 'puzzle'),
    ('DuskyDungeon-0.1.0.gb', 'action'),
    ('el-jamon-volador_1.2.1.gb', 'action'),
    ('frozen-bubble-native', 'puzzle'),
    ('libbet.gb', 'puzzle'),
    ('neverball-native', 'puzzle'),
    ('nova.nes', 'platformer'),
    ('pizza_palace.gb', 'simulation'),
    ('Postie-1.1.gbc', 'platformer'),
    ('qulqy_jam.gbc', 'puzzle'),
    ('Rebound.gbc', 'platformer'),
    ('rex-runner.gb', 'platformer'),
    ('scorpion-illuminati.md', 'arcade'),
    ('Solar_Guard_GBA_JAM_2021.gba', 'shooter'),
    ('Trabant_1_3.gbc', 'simulation'),
    ('knight2.gb', 'platformer'),
    ('Wyrmhole.gb', 'shooter'),
    ('xniq-alpha.gba', 'puzzle'),

    -- Legacy seeded catalog rows. These may be unpublished, but assigning
    -- their metadata now keeps staging and production histories consistent.
    ('Adventure Island 3 (USA).nes', 'platformer'),
    ('Contra (USA).nes', 'shooter'),
    ('Chip ''n Dale - Rescue Rangers 2 (USA).nes', 'platformer'),
    ('Snow Brothers (USA).nes', 'platformer'),
    ('owlia.nes', 'adventure'),
    ('Super Mario Bros. 3 (USA) (Rev 1).nes', 'platformer'),
    ('Mega Man 2 (USA).nes', 'platformer'),
    ('Ninja Gaiden (USA).nes', 'platformer'),
    ('Castlevania III - Dracula''s Curse (USA).nes', 'platformer'),
    ('Dragon Warrior (USA) (Rev 1).nes', 'role-playing'),
    ('Double Dragon III - The Sacred Stones (USA).nes', 'action'),
    ('Metal Gear (USA).nes', 'action'),
    ('Metroid (USA).nes', 'adventure'),
    ('Balloon Fight (USA).nes', 'arcade'),
    ('Darkwing Duck (USA).nes', 'platformer'),
    ('Dr. Mario (Japan, USA) (Rev 1).nes', 'puzzle'),
    ('Ghosts''n Goblins (USA).nes', 'platformer'),
    ('Kirby''s Adventure (USA) (Rev 1).nes', 'platformer'),
    ('Teenage Mutant Ninja Turtles (USA).nes', 'action'),
    ('Tetris (USA) (Tengen) (Unl).nes', 'puzzle'),
    ('little_sisyphus_v1.nes', 'platformer')
) AS genre_map(rom_filename, genre_slug)
WHERE games.rom_filename = genre_map.rom_filename
  AND games.genre_slug = 'other';
