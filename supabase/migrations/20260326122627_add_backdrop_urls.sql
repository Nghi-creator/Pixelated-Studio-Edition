-- 1. Add the new column (allow it to be null, since not all games will have backdrops)
ALTER TABLE games ADD COLUMN backdrop_url TEXT;

-- 2. Inject the high-res images for the specific games
UPDATE games 
SET backdrop_url = 'https://thekingofgrabs.com/wp-content/uploads/2023/02/adventure-island-3-nes-wide.png?w=1038&h=576&crop=1' 
WHERE title = 'Adventure Island 3';

UPDATE games 
SET backdrop_url = 'https://preview.redd.it/loz-aol-the-artwork-for-the-nes-games-look-like-screenshots-v0-iptbln65sqhe1.png?width=640&crop=smart&auto=webp&s=3c1da881ed5538ce0d485c4fc03bdc6f003e50df' 
WHERE title = 'The Legend of Zelda';

UPDATE games 
SET backdrop_url = 'https://static0.thegamerimages.com/wordpress/wp-content/uploads/2019/06/contra-timeline-title.jpg' 
WHERE title = 'Contra';

UPDATE games 
SET backdrop_url = 'https://images.launchbox-app.com//5769d889-76f2-42d2-9cbd-50eb99d2601f.jpg' 
WHERE title = 'Chip ''n Dale: Rescue Rangers 2';

UPDATE games 
SET backdrop_url = 'https://image.api.playstation.com/vulcan/ap/rnd/202410/2915/f5ecfdfbb9a9119e224e04971b12286182566fa273ecabf3.png' 
WHERE title = 'Snow Brothers';

UPDATE games 
SET backdrop_url = 'https://i.ytimg.com/vi/SKVCiOuWwaw/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLDT-gPOLBz2Zl1pDae8o7RmAjSB8Q' 
WHERE title = 'The Legend of Owlia';

UPDATE games 
SET backdrop_url = 'https://i.ebayimg.com/images/g/G0MAAOSwv7pjQbIt/s-l1200.jpg' 
WHERE title = 'Super Mario Bros. 3';

UPDATE games 
SET backdrop_url = 'https://static.wikia.nocookie.net/megaman/images/c/cb/Rockman_2_package_art.png/revision/latest/scale-to-width-down/1200?cb=20191116023117' 
WHERE title = 'Mega Man 2';

UPDATE games 
SET backdrop_url = 'https://i.etsystatic.com/23724123/r/il/2329e0/2465279803/il_fullxfull.2465279803_nqe2.jpg' 
WHERE title = 'Ninja Gaiden';

UPDATE games 
SET backdrop_url = 'https://i.ytimg.com/vi/sCeuWDwehec/maxresdefault.jpg' 
WHERE title = 'Castlevania III: Dracula''s Curse';

UPDATE games 
SET backdrop_url = 'https://img.itch.zone/aW1nLzEzNzg4Mjc2LnBuZw==/original/rSU7uT.png' 
WHERE title = 'Little Sisyphus';

UPDATE games 
SET backdrop_url = 'https://cdn.thegamesdb.net/images/medium/fanart/2868-1.jpg' 
WHERE title = 'Aladdin';