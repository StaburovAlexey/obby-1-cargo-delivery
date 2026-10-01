// Original user-supplied meshes, rigs, UVs and embedded materials.
export const CHARACTER_CATALOG = Object.freeze([
  Object.freeze({"id": "bacon", "name": "Bacon", "source": "Obby_pack10_Bacon.glb", "sha256": "eb78b0d387d323905bc0151d4a533a07acf61cea6d98de417c105079750a6415", "bytes": 704152, "textured": true, url: new URL("./assets/bacon.glb", import.meta.url) }),
  Object.freeze({"id": "pack1", "name": "Pack 1", "source": "Obby_pack1.glb", "sha256": "ceb7a729d38d976318fc5768142be42387c7e753b329ac025b58d24a9e73b95c", "bytes": 711244, "textured": true, url: new URL("./assets/characters/Obby_pack1.glb", import.meta.url) }),
  Object.freeze({"id": "pack2", "name": "Pack 2", "source": "Obby_pack2.glb", "sha256": "727b6dca8907df22120bb1bc2e8e9e1538f346e64103cb2ed3b16ff0873be4f1", "bytes": 569896, "textured": true, url: new URL("./assets/characters/Obby_pack2.glb", import.meta.url) }),
  Object.freeze({"id": "pack3", "name": "Pack 3", "source": "Obby_pack3.glb", "sha256": "6bc5c996700cf7d63187245deb6a3c7a8453143db47e0e1d4b8ae5c3634fecc4", "bytes": 637112, "textured": true, url: new URL("./assets/characters/Obby_pack3.glb", import.meta.url) }),
  Object.freeze({"id": "pack4", "name": "Pack 4", "source": "Obby_pack4.glb", "sha256": "b21927e282545cb160359adab6cd8af93cc9de64b2a87eda8febb9566b985fd1", "bytes": 761484, "textured": true, url: new URL("./assets/characters/Obby_pack4.glb", import.meta.url) }),
  Object.freeze({"id": "pack5", "name": "Pack 5", "source": "Obby_pack5.glb", "sha256": "e0e6f596b5d0f1f86494f2a4c6b06b910c8224a5ae8bb153ab38c514b3e3399e", "bytes": 681876, "textured": true, url: new URL("./assets/characters/Obby_pack5.glb", import.meta.url) }),
  Object.freeze({"id": "pack6", "name": "Pack 6", "source": "Obby_pack6.glb", "sha256": "3305f8032e8e9352fb042c9abb30b2101a379ad42188a696b905245d22580076", "bytes": 847824, "textured": true, url: new URL("./assets/characters/Obby_pack6.glb", import.meta.url) }),
  Object.freeze({"id": "pack7", "name": "Pack 7", "source": "Obby_pack7.glb", "sha256": "5f6b06c9c1a2ea62913066c599d31a1eb6f8aabfa268620eeb814363f61fc538", "bytes": 679000, "textured": true, url: new URL("./assets/characters/Obby_pack7.glb", import.meta.url) }),
  Object.freeze({"id": "pack9", "name": "Pack 9", "source": "Obby_pack9.glb", "sha256": "baab2654c98b9198df8a8a66f1c61377426d7e0037a74b876762a471aa1798a1", "bytes": 717124, "textured": true, url: new URL("./assets/characters/Obby_pack9.glb", import.meta.url) }),
  Object.freeze({"id": "pirate", "name": "Pirate", "source": "Obby_Pirate.glb", "sha256": "8dbc5eb3408eb4be098377cf402ede65ff1bf8ff64a8991449c0bb9c6253ae1f", "bytes": 550428, "textured": true, url: new URL("./assets/characters/Obby_Pirate.glb", import.meta.url) }),
  Object.freeze({"id": "robux-man", "name": "Robux Man", "source": "Obby_Robux_Man.glb", "sha256": "f15829276986d2857434f6e159a59ba5869c4ff490ff8c5fe76234cf5efe4000", "bytes": 1037708, "textured": true, url: new URL("./assets/characters/Obby_Robux_Man.glb", import.meta.url) }),
  Object.freeze({"id": "jeff-the-killer", "name": "Jeff the Killer", "source": "Obby_Jeff_The_Killer.glb", "sha256": "ce20af73f26dd3c81746b9a01496e8b0bf1d77409e5034252b375f7c5e808231", "bytes": 825132, "textured": true, url: new URL("./assets/characters/Obby_Jeff_The_Killer.glb", import.meta.url) }),
  Object.freeze({"id": "spider-man", "name": "Spider-Man", "source": "Obby_Spider-Man.glb", "sha256": "1f5a5e52b0f591060efc06a127682884b403036560e8f1d4a79f108f80df5e82", "bytes": 587284, "textured": false, url: new URL("./assets/characters/Obby_Spider-Man.glb", import.meta.url) }),
  Object.freeze({"id": "spyder-sammy", "name": "Spyder Sammy", "source": "Obby_Spyder_Sammy.glb", "sha256": "6451e12435bee6077e90953eb8155ee002c05bb2aad3da97425d54faffd49c8e", "bytes": 1042884, "textured": true, url: new URL("./assets/characters/Obby_Spyder_Sammy.glb", import.meta.url) }),
  Object.freeze({"id": "kreekcraft", "name": "KreekCraft", "source": "Obby_KreekCraft.glb", "sha256": "ef26b7bb55a2a1f655dacdc6d8821ba584451c0650f6eb9b7e4d14b39bf29de7", "bytes": 901952, "textured": true, url: new URL("./assets/characters/Obby_KreekCraft.glb", import.meta.url) }),
  Object.freeze({"id": "jandel", "name": "Jandel", "source": "Obby_Jandel.glb", "sha256": "76a11e1ac5215ea8ab58db384cf8dbaca83bf90217afc2e9a3c9cf6466157095", "bytes": 634720, "textured": true, url: new URL("./assets/characters/Obby_Jandel.glb", import.meta.url) }),
  Object.freeze({"id": "dancing-npc-girl", "name": "Dancing NPC Girl", "source": "Obby_dancing_NPC_girl.glb", "sha256": "4eeeee6877bf5502f23cd06299dd23a6307d8ee4c1d57c2eb075b7c453fbcd90", "bytes": 1035344, "textured": true, url: new URL("./assets/characters/Obby_dancing_NPC_girl.glb", import.meta.url) }),
]);
export const DEFAULT_CHARACTER_ID = "bacon";
export function getCharacterEntry(id = DEFAULT_CHARACTER_ID) {
  const entry = CHARACTER_CATALOG.find(character => character.id === id);
  if (!entry) throw new Error(`Unknown character: ${id}`);
  return entry;
}
