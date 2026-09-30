/**
 * FH Audio V2 - Roblox Stealth Scene & Ambiance Alias Generator
 * Menghasilkan judul aset game alami seperti "BGM_Cyber_City_Part1"
 * untuk mengelabui bot moderasi teks & filter hak cipta Roblox.
 */

(function () {
  'use strict';

  const SCENE_CATEGORIES = {
    action: [
      'Boss_Arena', 'Combat_Zone', 'Final_Showdown', 'Warzone', 'Raid_Dungeon',
      'Colosseum', 'Gladiator_Pit', 'Challenger_Gate', 'Battleground', 'Fortress_Siege',
      'Epic_Climax', 'High_Pursuit', 'Victory_March', 'Warrior_Sanctum', 'Shadow_Keep'
    ],
    cyber: [
      'Cyber_City', 'Neon_District', 'Metro_Station', 'Space_Station', 'Orbital_Deck',
      'Abandoned_Lab', 'Quantum_Core', 'Midnight_Highway', 'Underground_Vault', 'Reactor_Chamber',
      'Synth_Wave', 'Matrix_Hub', 'Sky_Highway', 'Cyber_Bunker', 'Hacker_Den'
    ],
    fantasy: [
      'Ancient_Temple', 'Sky_Sanctuary', 'Castle_Ruins', 'Tavern_Hall', 'Enchanted_Forest',
      'Dark_Cavern', 'Crystal_Cave', 'Desert_Oasis', 'Lost_Ruins', 'Forgotten_Kingdom',
      'Dragon_Peak', 'Mystic_Shrine', 'Celestial_Tower', 'Elven_Grove', 'Dungeon_Keep'
    ],
    ambient: [
      'Main_Lobby', 'Chill_Lounge', 'Sunset_Breeze', 'Night_Market', 'Rainy_Cafe',
      'Ocean_View', 'Quiet_Meadow', 'Starlight_Camp', 'Autumn_Park', 'Peaceful_Village',
      'Cozy_Room', 'Moonlit_Beach', 'Zen_Garden', 'Morning_Mist', 'Windy_Hill'
    ]
  };

  const ALL_SCENES = [
    ...SCENE_CATEGORIES.action,
    ...SCENE_CATEGORIES.cyber,
    ...SCENE_CATEGORIES.fantasy,
    ...SCENE_CATEGORIES.ambient
  ];

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function getRandomScene(category = 'all') {
    const pool = (category && SCENE_CATEGORIES[category]) ? SCENE_CATEGORIES[category] : ALL_SCENES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function getDeterministicScene(seed, category = 'all') {
    const pool = (category && SCENE_CATEGORIES[category]) ? SCENE_CATEGORIES[category] : ALL_SCENES;
    const idx = simpleHash(String(seed || 'bgm_seed')) % pool.length;
    return pool[idx];
  }

  function generatePartAlias(sceneName, partNum = 1, totalParts = 1, prefix = 'BGM') {
    const cleanPrefix = (prefix || 'BGM').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanScene = (sceneName || 'Main_Lobby').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = (totalParts > 1 || partNum > 1) ? `_Part${partNum}` : '_Part1';
    let full = `${cleanPrefix}_${cleanScene}${suffix}`;
    if (full.length > 50) {
      full = full.substring(0, 50);
    }
    return full;
  }

  window.FHAlias = {
    SCENE_CATEGORIES,
    ALL_SCENES,
    getRandomScene,
    getDeterministicScene,
    generatePartAlias
  };
})();
