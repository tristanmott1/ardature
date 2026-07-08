import { useMemo, useState } from "react";
import {
  createInitialTerritoryStates,
  pressTerritory,
  selectedTerritoryId,
  setSelectedTerritorySkin,
  type TerritoryStates,
} from "./game/gameState";
import { generatedMapData } from "./map/generated/mapData";
import { MapView } from "./map/components/MapView";
import { SkinPicker } from "./map/components/SkinPicker";
import type { MapSkin } from "./map/mapTypes";

function App() {
  const [territoryStates, setTerritoryStates] = useState<TerritoryStates>(() => createInitialTerritoryStates());
  const selectedId = selectedTerritoryId(territoryStates);
  const selectedState = selectedId ? territoryStates[selectedId] : null;
  const selectedTerritory = useMemo(
    () => generatedMapData.territories.find((territory) => territory.id === selectedId) ?? null,
    [selectedId],
  );

  function handleTerritoryPress(territoryId: string) {
    setTerritoryStates((current) => pressTerritory(current, territoryId));
  }

  function handleSkinSelect(skin: MapSkin) {
    setTerritoryStates((current) => setSelectedTerritorySkin(current, skin));
  }

  return (
    <main className="app-shell" data-selected-territory={selectedId ?? ""}>
      <SkinPicker
        mapData={generatedMapData}
        onSelectSkin={handleSkinSelect}
        selectedState={selectedState}
        selectedTerritory={selectedTerritory}
      />
      <MapView mapData={generatedMapData} onTerritoryPress={handleTerritoryPress} territoryStates={territoryStates} />
    </main>
  );
}

export default App;
