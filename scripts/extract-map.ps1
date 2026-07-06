param(
  [string]$InputImage = "maps/source/territory-boundaries.jpeg",
  [string]$TerritoryKey = "maps/territory-key.md",
  [string]$OutputJson = "maps/geometry/map.json",
  [string]$PreviewBaseImage = "maps/source/middle-earth-reference.jpg",
  [string]$PreviewSvg = "maps/previews/territories.svg",
  [int]$MinRed = 150,
  [int]$RedDominance = 45,
  [int]$MinBlue = 120,
  [int]$BlueDominance = 35,
  [int]$RegionBarrierDilateRadius = 1,
  [int]$TerritoryBarrierDilateRadius = 2,
  [int]$MinComponentArea = 100,
  [int]$MapScale = 10,
  [int]$SmoothPasses = 2,
  [double]$SimplifyTolerance = 1.5
)

$ErrorActionPreference = "Stop"

$inputPath = (Resolve-Path $InputImage).Path
$territoryKeyPath = (Resolve-Path $TerritoryKey).Path
$jsonPath = Join-Path (Get-Location) $OutputJson
$previewBasePath = (Resolve-Path $PreviewBaseImage).Path
$previewSvgPath = Join-Path (Get-Location) $PreviewSvg

New-Item -ItemType Directory -Force -Path (Split-Path $jsonPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $previewSvgPath) | Out-Null

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

public static class MapExtractor
{
    struct PointI
    {
        public int X;
        public int Y;

        public PointI(int x, int y)
        {
            X = x;
            Y = y;
        }
    }

    struct PointD
    {
        public double X;
        public double Y;

        public PointD(double x, double y)
        {
            X = x;
            Y = y;
        }
    }

    struct Segment
    {
        public PointI A;
        public PointI B;

        public Segment(PointI a, PointI b)
        {
            A = a;
            B = b;
        }
    }

    class RegionSeed
    {
        public string Id;
        public string Name;
        public int X;
        public int Y;
    }

    class TerritorySeed
    {
        public string Id;
        public string Name;
        public string RegionId;
        public int X;
        public int Y;
    }

    class BackgroundSeed
    {
        public string Id;
        public string Name;
        public int X;
        public int Y;
    }

    class RegionConfig
    {
        public string Id;
        public string Name;
        public string Color;
        public string[] TerritoryIds;
    }

    class TerritoryKeyEntry
    {
        public string Id;
        public string Name;
        public string RegionId;
        public string[] LandBorders;
        public string[] ShipBorders;
    }

    class TerritoryInfo
    {
        public string Id;
        public string Name;
        public string RegionId;
        public bool Playable;
        public string[] LandConnections;
        public string[] ShipConnections;
        public List<string> BorderIds = new List<string>();
    }

    class BorderInfo
    {
        public string Id;
        public string[] TerritoryIds;
        public bool IsPlayableConnection;
        public List<List<PointD>> Paths;
    }

    class BorderBuilder
    {
        public string Id;
        public string[] TerritoryIds;
        public List<Segment> Segments = new List<Segment>();
    }

    class PathPiece
    {
        public string BorderId;
        public int PathIndex;
        public List<PointD> Points;
        public bool Used;
    }

    class ComponentResult
    {
        public int[] Labels;
        public Dictionary<int, int> Areas;
    }

    class ComponentStats
    {
        public int Label;
        public int Area;
        public double CentroidX;
        public double CentroidY;
    }

    static readonly int[] DirX = new int[] { 1, -1, 0, 0 };
    static readonly int[] DirY = new int[] { 0, 0, 1, -1 };

    static readonly RegionSeed[] RegionSeeds = new RegionSeed[]
    {
        new RegionSeed { Id = "eriador", Name = "Eriador", X = 365, Y = 335 },
        new RegionSeed { Id = "rhovanion", Name = "Rhovanion", X = 640, Y = 360 },
        new RegionSeed { Id = "rhun", Name = "Rhun", X = 1015, Y = 315 },
        new RegionSeed { Id = "rohan", Name = "Rohan", X = 675, Y = 620 },
        new RegionSeed { Id = "mordor", Name = "Mordor", X = 1010, Y = 700 },
        new RegionSeed { Id = "gondor", Name = "Gondor", X = 610, Y = 675 }
    };

    static readonly BackgroundSeed[] BackgroundSeeds = new BackgroundSeed[]
    {
        new BackgroundSeed { Id = "background-ocean", Name = "Ocean", X = 202, Y = 563 },
        new BackgroundSeed { Id = "background-north-east", Name = "North East Background", X = 954, Y = 56 },
        new BackgroundSeed { Id = "background-north-bay", Name = "North Bay Background", X = 281, Y = 21 }
    };

    static readonly RegionConfig[] RegionConfigs = new RegionConfig[]
    {
        new RegionConfig
        {
            Id = "eriador",
            Name = "Eriador",
            Color = "#88c37c",
            TerritoryIds = new string[]
            {
                "forlond", "harlindon", "grey-havens", "shire", "north-downs", "ettenmoors",
                "bree", "rivendell", "minhiriath", "swanfleet", "enedwaith", "isengard"
            }
        },
        new RegionConfig
        {
            Id = "rhovanion",
            Name = "Rhovanion",
            Color = "#d8b365",
            TerritoryIds = new string[]
            {
                "greylin", "caradhras", "moria", "lorien", "gladden-fields",
                "dol-guldur", "mirkwood", "emyn-muil", "dagorlad"
            }
        },
        new RegionConfig
        {
            Id = "rhun",
            Name = "Rhun",
            Color = "#d77a7a",
            TerritoryIds = new string[] { "erebor", "dale", "iron-hills", "dor-cuarthol", "sea-of-rhun", "dorwinion" }
        },
        new RegionConfig
        {
            Id = "rohan",
            Name = "Rohan",
            Color = "#c8c25d",
            TerritoryIds = new string[] { "westfold", "edoras", "emnet", "eastfold" }
        },
        new RegionConfig
        {
            Id = "mordor",
            Name = "Mordor",
            Color = "#9b7bbd",
            TerritoryIds = new string[] { "udun", "barad-dur", "minas-morgul", "nurn" }
        },
        new RegionConfig
        {
            Id = "gondor",
            Name = "Gondor",
            Color = "#7da9d6",
            TerritoryIds = new string[]
            {
                "druwaith-iaur", "andrast", "anfalas", "lamedon",
                "belfalas", "south-gondor", "minas-tirith"
            }
        }
    };

    static readonly TerritorySeed[] TerritorySeeds = new TerritorySeed[]
    {
        new TerritorySeed { Id = "forlond", Name = "Forlond", RegionId = "eriador", X = 105, Y = 145 },
        new TerritorySeed { Id = "harlindon", Name = "Harlindon", RegionId = "eriador", X = 155, Y = 310 },
        new TerritorySeed { Id = "grey-havens", Name = "Grey Havens", RegionId = "eriador", X = 245, Y = 175 },
        new TerritorySeed { Id = "shire", Name = "Shire", RegionId = "eriador", X = 285, Y = 305 },
        new TerritorySeed { Id = "north-downs", Name = "North Downs", RegionId = "eriador", X = 366, Y = 74 },
        new TerritorySeed { Id = "ettenmoors", Name = "Ettenmoors", RegionId = "eriador", X = 529, Y = 92 },
        new TerritorySeed { Id = "bree", Name = "Bree", RegionId = "eriador", X = 415, Y = 280 },
        new TerritorySeed { Id = "rivendell", Name = "Rivendell", RegionId = "eriador", X = 545, Y = 220 },
        new TerritorySeed { Id = "minhiriath", Name = "Minhiriath", RegionId = "eriador", X = 330, Y = 420 },
        new TerritorySeed { Id = "swanfleet", Name = "Swanfleet", RegionId = "eriador", X = 505, Y = 385 },
        new TerritorySeed { Id = "enedwaith", Name = "Enedwaith", RegionId = "eriador", X = 445, Y = 515 },
        new TerritorySeed { Id = "isengard", Name = "Isengard", RegionId = "eriador", X = 565, Y = 510 },

        new TerritorySeed { Id = "greylin", Name = "Greylin", RegionId = "rhovanion", X = 675, Y = 95 },
        new TerritorySeed { Id = "caradhras", Name = "Caradhras", RegionId = "rhovanion", X = 675, Y = 215 },
        new TerritorySeed { Id = "moria", Name = "Moria", RegionId = "rhovanion", X = 655, Y = 325 },
        new TerritorySeed { Id = "lorien", Name = "Lorien", RegionId = "rhovanion", X = 625, Y = 445 },
        new TerritorySeed { Id = "gladden-fields", Name = "Gladden Fields", RegionId = "rhovanion", X = 735, Y = 265 },
        new TerritorySeed { Id = "dol-guldur", Name = "Dol Guldur", RegionId = "rhovanion", X = 725, Y = 375 },
        new TerritorySeed { Id = "mirkwood", Name = "Mirkwood", RegionId = "rhovanion", X = 825, Y = 260 },
        new TerritorySeed { Id = "emyn-muil", Name = "Emyn Muil", RegionId = "rhovanion", X = 760, Y = 475 },
        new TerritorySeed { Id = "dagorlad", Name = "Dagorlad", RegionId = "rhovanion", X = 845, Y = 475 },

        new TerritorySeed { Id = "erebor", Name = "Erebor", RegionId = "rhun", X = 925, Y = 155 },
        new TerritorySeed { Id = "dale", Name = "Dale", RegionId = "rhun", X = 950, Y = 275 },
        new TerritorySeed { Id = "iron-hills", Name = "Iron Hills", RegionId = "rhun", X = 1100, Y = 180 },
        new TerritorySeed { Id = "dor-cuarthol", Name = "Dor Cuarthol", RegionId = "rhun", X = 1060, Y = 365 },
        new TerritorySeed { Id = "sea-of-rhun", Name = "Sea of Rhun", RegionId = "rhun", X = 1135, Y = 430 },
        new TerritorySeed { Id = "dorwinion", Name = "Dorwinion", RegionId = "rhun", X = 965, Y = 440 },

        new TerritorySeed { Id = "westfold", Name = "Westfold", RegionId = "rohan", X = 590, Y = 490 },
        new TerritorySeed { Id = "edoras", Name = "Edoras", RegionId = "rohan", X = 618, Y = 557 },
        new TerritorySeed { Id = "emnet", Name = "Emnet", RegionId = "rohan", X = 695, Y = 502 },
        new TerritorySeed { Id = "eastfold", Name = "Eastfold", RegionId = "rohan", X = 722, Y = 596 },

        new TerritorySeed { Id = "udun", Name = "Udun", RegionId = "mordor", X = 910, Y = 620 },
        new TerritorySeed { Id = "barad-dur", Name = "Barad-dur", RegionId = "mordor", X = 1080, Y = 620 },
        new TerritorySeed { Id = "minas-morgul", Name = "Minas Morgul", RegionId = "mordor", X = 935, Y = 715 },
        new TerritorySeed { Id = "nurn", Name = "Nurn", RegionId = "mordor", X = 1110, Y = 725 },

        new TerritorySeed { Id = "druwaith-iaur", Name = "Druwaith Iaur", RegionId = "gondor", X = 441, Y = 570 },
        new TerritorySeed { Id = "andrast", Name = "Andrast", RegionId = "gondor", X = 374, Y = 668 },
        new TerritorySeed { Id = "anfalas", Name = "Anfalas", RegionId = "gondor", X = 465, Y = 646 },
        new TerritorySeed { Id = "lamedon", Name = "Lamedon", RegionId = "gondor", X = 573, Y = 631 },
        new TerritorySeed { Id = "belfalas", Name = "Belfalas", RegionId = "gondor", X = 679, Y = 683 },
        new TerritorySeed { Id = "south-gondor", Name = "South Gondor", RegionId = "gondor", X = 781, Y = 761 },
        new TerritorySeed { Id = "minas-tirith", Name = "Minas Tirith", RegionId = "gondor", X = 809, Y = 648 }
    };

    public static void Extract(
        string inputImage,
        string territoryKey,
        string outputJson,
        string previewBaseImage,
        string previewSvg,
        int minRed,
        int redDominance,
        int minBlue,
        int blueDominance,
        int regionBarrierDilateRadius,
        int territoryBarrierDilateRadius,
        int minComponentArea,
        int mapScale,
        int smoothPasses,
        double simplifyTolerance)
    {
        if (mapScale <= 0)
        {
            throw new InvalidOperationException("Map scale must be greater than zero.");
        }

        if (smoothPasses < 0)
        {
            throw new InvalidOperationException("Smooth passes cannot be negative.");
        }

        if (simplifyTolerance < 0)
        {
            throw new InvalidOperationException("Simplify tolerance cannot be negative.");
        }

        Dictionary<string, TerritoryKeyEntry> keyEntries = ReadTerritoryKey(territoryKey);
        ValidateTerritoryCatalog(keyEntries);

        using (var sourceBitmap = new Bitmap(inputImage))
        {
            int width = sourceBitmap.Width;
            int height = sourceBitmap.Height;

            // First resolve every source pixel into exactly one region.
            string[] regionIds = BuildRegionPixelModel(sourceBitmap, width, height, minRed, redDominance, regionBarrierDilateRadius, minComponentArea);

            // Then resolve every source pixel into exactly one territory, including background.
            string[] territoryIds = new string[width * height];
            foreach (RegionConfig region in RegionConfigs)
            {
                ProcessPlayableRegion(
                    region,
                    sourceBitmap,
                    regionIds,
                    territoryIds,
                    width,
                    height,
                    minRed,
                    redDominance,
                    minBlue,
                    blueDominance,
                    territoryBarrierDilateRadius,
                    minComponentArea);
            }
            ProcessBackgroundRegion(regionIds, territoryIds, width, height, minComponentArea);

            Dictionary<string, TerritoryInfo> territories = BuildTerritoryInfos(keyEntries);
            ValidateTerritoryGrid(territoryIds, territories, width, height);

            // Finally derive the canonical shared border objects from the territory grid.
            List<BorderInfo> borders = ExtractBorders(territoryIds, territories, keyEntries, width, height, mapScale, smoothPasses, simplifyTolerance);
            AttachBorderIds(territories, borders);
            ValidateBorders(territories, borders, keyEntries, width * mapScale, height * mapScale);

            WriteMapJson(outputJson, inputImage, territoryKey, width, height, mapScale, territories, borders);
            WriteTerritoriesSvg(previewSvg, previewBaseImage, width, height, mapScale, territories, borders);

            Console.WriteLine("Image: " + width.ToString(CultureInfo.InvariantCulture) + "x" + height.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Map units: " + (width * mapScale).ToString(CultureInfo.InvariantCulture) + "x" + (height * mapScale).ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Regions: 7");
            Console.WriteLine("Territories: " + territories.Count.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Playable territories: " + territories.Values.Count(t => t.Playable).ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Background territories: " + territories.Values.Count(t => !t.Playable).ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Borders: " + borders.Count.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Map JSON: " + outputJson);
            Console.WriteLine("Territories preview: " + previewSvg);
        }
    }

    static string[] BuildRegionPixelModel(Bitmap bitmap, int width, int height, int minRed, int redDominance, int barrierDilateRadius, int minComponentArea)
    {
        bool[] red = DetectRed(bitmap, minRed, redDominance);
        bool[] barrier = Dilate(red, width, height, barrierDilateRadius);
        ComponentResult initialComponents = LabelComponents(barrier, width, height);
        RemoveTinyComponents(initialComponents.Labels, initialComponents.Areas, minComponentArea);
        ComponentResult components = RelabelFromLabels(initialComponents.Labels, width, height);
        Dictionary<int, string> componentRegionIds = AssignSemanticRegions(components, width, height);
        int[] filledComponentLabels = FillBarriersByNearestComponent(components.Labels, width, height);
        return ProjectPixelsToRegions(filledComponentLabels, componentRegionIds);
    }

    static void ProcessPlayableRegion(
        RegionConfig region,
        Bitmap bitmap,
        string[] regionIds,
        string[] territoryIds,
        int width,
        int height,
        int minRed,
        int redDominance,
        int minBlue,
        int blueDominance,
        int barrierDilateRadius,
        int minComponentArea)
    {
        bool[] insideRegion = new bool[width * height];
        for (int i = 0; i < insideRegion.Length; i++)
        {
            insideRegion[i] = regionIds[i] == region.Id;
        }

        bool[] colorBarrier = DetectRedOrBlue(bitmap, minRed, redDominance, minBlue, blueDominance);
        bool[] dilatedColorBarrier = Dilate(colorBarrier, width, height, barrierDilateRadius);
        bool[] barrier = new bool[width * height];
        for (int i = 0; i < barrier.Length; i++)
        {
            barrier[i] = !insideRegion[i] || dilatedColorBarrier[i];
        }

        ComponentResult initialComponents = LabelComponents(barrier, width, height);
        RemoveTinyComponents(initialComponents.Labels, initialComponents.Areas, minComponentArea);
        ComponentResult components = RelabelFromLabels(initialComponents.Labels, width, height);

        List<ComponentStats> stats = CalculateComponentStats(components.Labels, components.Areas, width);
        if (stats.Count < region.TerritoryIds.Length)
        {
            throw new InvalidOperationException(region.Name + " should have at least " + region.TerritoryIds.Length.ToString(CultureInfo.InvariantCulture) + " territory components but has " + stats.Count.ToString(CultureInfo.InvariantCulture) + ".");
        }

        Dictionary<int, string> componentTerritoryIds = AssignTerritoriesToComponents(region, components, stats, width, height);
        int[] filledLabels = FillMaskedBarriersByNearestComponent(components.Labels, insideRegion, width, height);

        for (int i = 0; i < filledLabels.Length; i++)
        {
            if (!insideRegion[i])
            {
                continue;
            }

            string territoryId;
            if (!componentTerritoryIds.TryGetValue(filledLabels[i], out territoryId))
            {
                throw new InvalidOperationException("Filled label has no territory id in " + region.Name + ".");
            }

            territoryIds[i] = territoryId;
        }

        string mergeNote = stats.Count > region.TerritoryIds.Length
            ? " (" + (stats.Count - region.TerritoryIds.Length).ToString(CultureInfo.InvariantCulture) + " extra merged)"
            : "";
        Console.WriteLine(region.Name + " source components: " + stats.Count.ToString(CultureInfo.InvariantCulture) + mergeNote);
    }

    static void ProcessBackgroundRegion(string[] regionIds, string[] territoryIds, int width, int height, int minComponentArea)
    {
        bool[] insideBackground = new bool[regionIds.Length];
        for (int i = 0; i < insideBackground.Length; i++)
        {
            insideBackground[i] = regionIds[i] == "background";
        }

        bool[] barrier = new bool[regionIds.Length];
        for (int i = 0; i < barrier.Length; i++)
        {
            barrier[i] = !insideBackground[i];
        }

        ComponentResult initialComponents = LabelComponents(barrier, width, height);
        RemoveTinyComponents(initialComponents.Labels, initialComponents.Areas, minComponentArea);
        ComponentResult components = RelabelFromLabels(initialComponents.Labels, width, height);
        if (components.Areas.Count != BackgroundSeeds.Length)
        {
            throw new InvalidOperationException("Expected " + BackgroundSeeds.Length.ToString(CultureInfo.InvariantCulture) + " background components but found " + components.Areas.Count.ToString(CultureInfo.InvariantCulture) + ".");
        }

        Dictionary<int, string> componentTerritoryIds = AssignBackgroundsToComponents(components, width, height);
        for (int i = 0; i < components.Labels.Length; i++)
        {
            int label = components.Labels[i];
            if (label < 0)
            {
                continue;
            }

            territoryIds[i] = componentTerritoryIds[label];
        }

        Console.WriteLine("Background source components: " + components.Areas.Count.ToString(CultureInfo.InvariantCulture));
    }

    static Dictionary<int, string> AssignSemanticRegions(ComponentResult components, int width, int height)
    {
        Dictionary<int, string> result = new Dictionary<int, string>();
        HashSet<int> used = new HashSet<int>();

        foreach (RegionSeed seed in RegionSeeds)
        {
            int label = FindNearestComponentLabel(components.Labels, width, height, seed.X, seed.Y, 80);
            if (label < 0)
            {
                throw new InvalidOperationException("No component was found near region seed " + seed.Id + ".");
            }

            if (used.Contains(label))
            {
                throw new InvalidOperationException("Region seed " + seed.Id + " maps to a component already used by another region.");
            }

            used.Add(label);
            result[label] = seed.Id;
        }

        foreach (int label in components.Areas.Keys)
        {
            if (!result.ContainsKey(label))
            {
                result[label] = "background";
            }
        }

        return result;
    }

    static Dictionary<int, string> AssignTerritoriesToComponents(RegionConfig region, ComponentResult components, List<ComponentStats> stats, int width, int height)
    {
        Dictionary<int, string> result = new Dictionary<int, string>();
        HashSet<int> usedLabels = new HashSet<int>();
        HashSet<string> expected = new HashSet<string>(region.TerritoryIds);
        List<TerritorySeed> regionSeeds = TerritorySeeds.Where(s => s.RegionId == region.Id).ToList();

        foreach (TerritorySeed seed in regionSeeds)
        {
            if (!expected.Contains(seed.Id))
            {
                throw new InvalidOperationException("Seed " + seed.Id + " is not expected in region " + region.Id + ".");
            }

            int label = FindNearestComponentLabel(components.Labels, width, height, seed.X, seed.Y, 90);
            if (label < 0)
            {
                throw new InvalidOperationException("No component was found near territory seed " + seed.Id + ".");
            }

            if (usedLabels.Contains(label))
            {
                throw new InvalidOperationException("Territory seed " + seed.Id + " maps to a component already used by another territory.");
            }

            usedLabels.Add(label);
            result[label] = seed.Id;
        }

        // Tiny extra components can be produced by drawing noise; fold them into the nearest seeded territory.
        foreach (int label in components.Areas.Keys)
        {
            if (!result.ContainsKey(label))
            {
                ComponentStats component = stats.First(s => s.Label == label);
                TerritorySeed nearestSeed = regionSeeds
                    .OrderBy(seed => DistanceSquared(component.CentroidX, component.CentroidY, seed.X, seed.Y))
                    .First();
                result[label] = nearestSeed.Id;
                Console.WriteLine("Merged extra " + region.Name + " component " + label.ToString(CultureInfo.InvariantCulture) + " into " + nearestSeed.Name + ".");
            }
        }

        return result;
    }

    static Dictionary<int, string> AssignBackgroundsToComponents(ComponentResult components, int width, int height)
    {
        Dictionary<int, string> result = new Dictionary<int, string>();
        HashSet<int> usedLabels = new HashSet<int>();

        foreach (BackgroundSeed seed in BackgroundSeeds)
        {
            int label = FindNearestComponentLabel(components.Labels, width, height, seed.X, seed.Y, 160);
            if (label < 0)
            {
                throw new InvalidOperationException("No component was found near background seed " + seed.Id + ".");
            }

            if (usedLabels.Contains(label))
            {
                throw new InvalidOperationException("Background seed " + seed.Id + " maps to a component already used by another background territory.");
            }

            usedLabels.Add(label);
            result[label] = seed.Id;
        }

        return result;
    }

    static Dictionary<string, TerritoryInfo> BuildTerritoryInfos(Dictionary<string, TerritoryKeyEntry> keyEntries)
    {
        Dictionary<string, TerritoryInfo> result = new Dictionary<string, TerritoryInfo>();

        foreach (TerritorySeed seed in TerritorySeeds)
        {
            TerritoryKeyEntry entry = keyEntries[seed.Id];
            result[seed.Id] = new TerritoryInfo
            {
                Id = seed.Id,
                Name = entry.Name,
                RegionId = entry.RegionId,
                Playable = true,
                LandConnections = entry.LandBorders,
                ShipConnections = entry.ShipBorders
            };
        }

        foreach (BackgroundSeed seed in BackgroundSeeds)
        {
            result[seed.Id] = new TerritoryInfo
            {
                Id = seed.Id,
                Name = seed.Name,
                RegionId = "background",
                Playable = false,
                LandConnections = new string[0],
                ShipConnections = new string[0]
            };
        }

        return result;
    }

    static List<BorderInfo> ExtractBorders(string[] territoryIds, Dictionary<string, TerritoryInfo> territories, Dictionary<string, TerritoryKeyEntry> keyEntries, int width, int height, int mapScale, int smoothPasses, double simplifyTolerance)
    {
        Dictionary<string, BorderBuilder> builders = new Dictionary<string, BorderBuilder>();

        // Scan each interior grid edge once: right edges and bottom edges are enough.
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                string territoryId = territoryIds[y * width + x];
                if (x + 1 < width)
                {
                    string otherId = territoryIds[y * width + x + 1];
                    AddBorderSegment(builders, territoryId, otherId, new Segment(new PointI(x + 1, y), new PointI(x + 1, y + 1)));
                }

                if (y + 1 < height)
                {
                    string otherId = territoryIds[(y + 1) * width + x];
                    AddBorderSegment(builders, territoryId, otherId, new Segment(new PointI(x, y + 1), new PointI(x + 1, y + 1)));
                }
            }
        }

        AddPageBorderSegments(builders, territoryIds, territories, width, height);

        List<BorderInfo> borders = new List<BorderInfo>();
        foreach (BorderBuilder builder in builders.Values.OrderBy(b => b.Id))
        {
            List<List<PointI>> rawPaths = TraceBorderPaths(builder.Segments);
            borders.Add(new BorderInfo
            {
                Id = builder.Id,
                TerritoryIds = builder.TerritoryIds,
                IsPlayableConnection = IsPlayableLandConnection(builder.TerritoryIds[0], builder.TerritoryIds[1], territories, keyEntries),
                Paths = FinalizePaths(rawPaths, mapScale, smoothPasses, simplifyTolerance)
            });
        }

        return borders;
    }

    static void AddPageBorderSegments(Dictionary<string, BorderBuilder> builders, string[] territoryIds, Dictionary<string, TerritoryInfo> territories, int width, int height)
    {
        // Treat playable page edges as real borders against the surrounding background.
        for (int x = 0; x < width; x++)
        {
            AddPageBorderSegment(builders, territories, territoryIds[x], "background-north-bay", new Segment(new PointI(x, 0), new PointI(x + 1, 0)));
            AddPageBorderSegment(builders, territories, territoryIds[(height - 1) * width + x], "background-ocean", new Segment(new PointI(x, height), new PointI(x + 1, height)));
        }

        for (int y = 0; y < height; y++)
        {
            AddPageBorderSegment(builders, territories, territoryIds[y * width], "background-ocean", new Segment(new PointI(0, y), new PointI(0, y + 1)));
            AddPageBorderSegment(builders, territories, territoryIds[y * width + width - 1], "background-north-east", new Segment(new PointI(width, y), new PointI(width, y + 1)));
        }
    }

    static void AddPageBorderSegment(Dictionary<string, BorderBuilder> builders, Dictionary<string, TerritoryInfo> territories, string territoryId, string backgroundId, Segment segment)
    {
        if (!territories[territoryId].Playable)
        {
            return;
        }

        AddBorderSegment(builders, territoryId, backgroundId, segment);
    }

    static void AddBorderSegment(Dictionary<string, BorderBuilder> builders, string territoryA, string territoryB, Segment segment)
    {
        if (territoryA == territoryB)
        {
            return;
        }

        string[] territoryIds = OrderedTerritoryPair(territoryA, territoryB);
        string borderId = BorderId(territoryIds[0], territoryIds[1]);
        BorderBuilder builder;
        if (!builders.TryGetValue(borderId, out builder))
        {
            builder = new BorderBuilder
            {
                Id = borderId,
                TerritoryIds = territoryIds
            };
            builders[borderId] = builder;
        }

        builder.Segments.Add(segment);
    }

    static List<List<PointI>> TraceBorderPaths(List<Segment> segments)
    {
        Dictionary<string, Segment> segmentByKey = new Dictionary<string, Segment>();
        Dictionary<string, List<PointI>> adjacency = new Dictionary<string, List<PointI>>();

        foreach (Segment segment in segments)
        {
            string key = SegmentKey(segment.A, segment.B);
            if (segmentByKey.ContainsKey(key))
            {
                continue;
            }

            segmentByKey[key] = segment;
            AddNeighbor(adjacency, segment.A, segment.B);
            AddNeighbor(adjacency, segment.B, segment.A);
        }

        HashSet<string> unused = new HashSet<string>(segmentByKey.Keys);
        List<List<PointI>> paths = new List<List<PointI>>();

        // Walk unused unit segments into one or more ordered border paths.
        while (unused.Count > 0)
        {
            PointI start = ChoosePathStart(unused, adjacency, segmentByKey);
            List<PointI> path = new List<PointI>();
            path.Add(start);

            PointI current = start;
            while (true)
            {
                PointI next;
                if (!TryGetUnusedNeighbor(current, unused, adjacency, out next))
                {
                    break;
                }

                unused.Remove(SegmentKey(current, next));
                path.Add(next);
                current = next;
            }

            paths.Add(CompressCollinear(path));
        }

        return paths
            .OrderByDescending(p => p.Count)
            .ThenBy(p => PointKey(p[0]), StringComparer.Ordinal)
            .ToList();
    }

    static void AddNeighbor(Dictionary<string, List<PointI>> adjacency, PointI point, PointI neighbor)
    {
        string key = PointKey(point);
        List<PointI> neighbors;
        if (!adjacency.TryGetValue(key, out neighbors))
        {
            neighbors = new List<PointI>();
            adjacency[key] = neighbors;
        }

        neighbors.Add(neighbor);
    }

    static PointI ChoosePathStart(HashSet<string> unused, Dictionary<string, List<PointI>> adjacency, Dictionary<string, Segment> segmentByKey)
    {
        foreach (string key in unused)
        {
            Segment segment = segmentByKey[key];
            if (UnusedDegree(segment.A, unused, adjacency) != 2)
            {
                return segment.A;
            }

            if (UnusedDegree(segment.B, unused, adjacency) != 2)
            {
                return segment.B;
            }
        }

        return segmentByKey[unused.First()].A;
    }

    static int UnusedDegree(PointI point, HashSet<string> unused, Dictionary<string, List<PointI>> adjacency)
    {
        List<PointI> neighbors;
        if (!adjacency.TryGetValue(PointKey(point), out neighbors))
        {
            return 0;
        }

        int count = 0;
        foreach (PointI neighbor in neighbors)
        {
            if (unused.Contains(SegmentKey(point, neighbor)))
            {
                count++;
            }
        }

        return count;
    }

    static bool TryGetUnusedNeighbor(PointI point, HashSet<string> unused, Dictionary<string, List<PointI>> adjacency, out PointI next)
    {
        List<PointI> neighbors;
        if (adjacency.TryGetValue(PointKey(point), out neighbors))
        {
            foreach (PointI neighbor in neighbors)
            {
                if (unused.Contains(SegmentKey(point, neighbor)))
                {
                    next = neighbor;
                    return true;
                }
            }
        }

        next = new PointI();
        return false;
    }

    static List<PointI> CompressCollinear(List<PointI> points)
    {
        if (points.Count <= 2)
        {
            return points;
        }

        List<PointI> result = new List<PointI>();
        result.Add(points[0]);

        for (int i = 1; i < points.Count - 1; i++)
        {
            PointI a = result[result.Count - 1];
            PointI b = points[i];
            PointI c = points[i + 1];

            int abX = b.X - a.X;
            int abY = b.Y - a.Y;
            int bcX = c.X - b.X;
            int bcY = c.Y - b.Y;
            if (abX * bcY == abY * bcX)
            {
                continue;
            }

            result.Add(b);
        }

        result.Add(points[points.Count - 1]);
        return result;
    }

    static List<List<PointD>> FinalizePaths(List<List<PointI>> paths, int mapScale, int smoothPasses, double simplifyTolerance)
    {
        List<List<PointD>> result = new List<List<PointD>>();

        foreach (List<PointI> path in paths)
        {
            bool closed = path.Count > 2 && SamePoint(path[0], path[path.Count - 1]);
            List<PointI> simplified = SimplifyPath(path, simplifyTolerance, closed);
            List<PointD> scaled = ScalePath(simplified, mapScale);
            result.Add(SmoothPath(scaled, smoothPasses, closed));
        }

        return result
            .OrderByDescending(p => p.Count)
            .ThenBy(p => PointKey(p[0]), StringComparer.Ordinal)
            .ToList();
    }

    static List<PointI> SimplifyPath(List<PointI> points, double tolerance, bool closed)
    {
        if (tolerance <= 0 || points.Count <= 2)
        {
            return new List<PointI>(points);
        }

        return closed ? SimplifyClosedPath(points, tolerance) : SimplifyOpenPath(points, tolerance);
    }

    static List<PointI> SimplifyOpenPath(List<PointI> points, double tolerance)
    {
        if (points.Count <= 2)
        {
            return new List<PointI>(points);
        }

        bool[] keep = new bool[points.Count];
        keep[0] = true;
        keep[points.Count - 1] = true;
        MarkSimplifiedPoints(points, 0, points.Count - 1, tolerance * tolerance, keep);

        List<PointI> result = new List<PointI>();
        for (int i = 0; i < points.Count; i++)
        {
            if (keep[i])
            {
                result.Add(points[i]);
            }
        }

        return result;
    }

    static List<PointI> SimplifyClosedPath(List<PointI> points, double tolerance)
    {
        List<PointI> ring = new List<PointI>(points);
        if (ring.Count > 1 && SamePoint(ring[0], ring[ring.Count - 1]))
        {
            ring.RemoveAt(ring.Count - 1);
        }

        if (ring.Count <= 3)
        {
            return CloseRing(ring);
        }

        int splitIndex = FarthestPointIndex(ring, ring[0]);
        if (splitIndex <= 0)
        {
            return CloseRing(ring);
        }

        List<PointI> firstHalf = new List<PointI>();
        for (int i = 0; i <= splitIndex; i++)
        {
            firstHalf.Add(ring[i]);
        }

        List<PointI> secondHalf = new List<PointI>();
        for (int i = splitIndex; i < ring.Count; i++)
        {
            secondHalf.Add(ring[i]);
        }
        secondHalf.Add(ring[0]);

        List<PointI> firstSimplified = SimplifyOpenPath(firstHalf, tolerance);
        List<PointI> secondSimplified = SimplifyOpenPath(secondHalf, tolerance);
        List<PointI> result = new List<PointI>(firstSimplified);

        // Join the two simplified halves without duplicating the split point.
        for (int i = 1; i < secondSimplified.Count; i++)
        {
            result.Add(secondSimplified[i]);
        }

        if (!SamePoint(result[0], result[result.Count - 1]))
        {
            result.Add(result[0]);
        }

        return result;
    }

    static void MarkSimplifiedPoints(List<PointI> points, int start, int end, double toleranceSquared, bool[] keep)
    {
        if (end <= start + 1)
        {
            return;
        }

        double maxDistance = -1;
        int maxIndex = -1;
        for (int i = start + 1; i < end; i++)
        {
            double distance = DistanceToSegmentSquared(points[i], points[start], points[end]);
            if (distance > maxDistance)
            {
                maxDistance = distance;
                maxIndex = i;
            }
        }

        if (maxDistance > toleranceSquared)
        {
            keep[maxIndex] = true;
            MarkSimplifiedPoints(points, start, maxIndex, toleranceSquared, keep);
            MarkSimplifiedPoints(points, maxIndex, end, toleranceSquared, keep);
        }
    }

    static List<PointI> CloseRing(List<PointI> ring)
    {
        List<PointI> result = new List<PointI>(ring);
        if (result.Count > 0 && !SamePoint(result[0], result[result.Count - 1]))
        {
            result.Add(result[0]);
        }

        return result;
    }

    static int FarthestPointIndex(List<PointI> points, PointI origin)
    {
        double maxDistance = -1;
        int maxIndex = -1;

        for (int i = 0; i < points.Count; i++)
        {
            double distance = DistanceSquared(points[i].X, points[i].Y, origin.X, origin.Y);
            if (distance > maxDistance)
            {
                maxDistance = distance;
                maxIndex = i;
            }
        }

        return maxIndex;
    }

    static double DistanceToSegmentSquared(PointI point, PointI start, PointI end)
    {
        double dx = end.X - start.X;
        double dy = end.Y - start.Y;
        if (dx == 0 && dy == 0)
        {
            return DistanceSquared(point.X, point.Y, start.X, start.Y);
        }

        double t = (((point.X - start.X) * dx) + ((point.Y - start.Y) * dy)) / ((dx * dx) + (dy * dy));
        if (t < 0)
        {
            t = 0;
        }

        if (t > 1)
        {
            t = 1;
        }

        double closestX = start.X + (t * dx);
        double closestY = start.Y + (t * dy);
        return DistanceSquared(point.X, point.Y, closestX, closestY);
    }

    static List<PointD> ScalePath(List<PointI> points, int mapScale)
    {
        List<PointD> result = new List<PointD>();

        foreach (PointI point in points)
        {
            result.Add(new PointD(point.X * mapScale, point.Y * mapScale));
        }

        return result;
    }

    static List<PointD> SmoothPath(List<PointD> points, int smoothPasses, bool closed)
    {
        if (smoothPasses == 0 || points.Count < 3)
        {
            return points;
        }

        List<PointD> result = points;
        for (int i = 0; i < smoothPasses; i++)
        {
            result = closed ? SmoothClosedPath(result) : SmoothOpenPath(result);
        }

        return result;
    }

    static List<PointD> SmoothOpenPath(List<PointD> points)
    {
        if (points.Count < 3)
        {
            return points;
        }

        List<PointD> result = new List<PointD>();
        result.Add(points[0]);

        // Cut each corner while preserving the fixed border junction endpoints.
        for (int i = 0; i < points.Count - 1; i++)
        {
            PointD a = points[i];
            PointD b = points[i + 1];
            result.Add(WeightedPoint(a, b, 0.75, 0.25));
            result.Add(WeightedPoint(a, b, 0.25, 0.75));
        }

        result.Add(points[points.Count - 1]);
        return result;
    }

    static List<PointD> SmoothClosedPath(List<PointD> points)
    {
        List<PointD> ring = points;
        if (SamePoint(points[0], points[points.Count - 1]))
        {
            ring = points.Take(points.Count - 1).ToList();
        }

        if (ring.Count < 3)
        {
            return points;
        }

        List<PointD> result = new List<PointD>();

        // Closed loops have no fixed endpoints, so smooth around the full ring.
        for (int i = 0; i < ring.Count; i++)
        {
            PointD a = ring[i];
            PointD b = ring[(i + 1) % ring.Count];
            result.Add(WeightedPoint(a, b, 0.75, 0.25));
            result.Add(WeightedPoint(a, b, 0.25, 0.75));
        }

        result.Add(result[0]);
        return result;
    }

    static PointD WeightedPoint(PointD a, PointD b, double aWeight, double bWeight)
    {
        return new PointD(
            (a.X * aWeight) + (b.X * bWeight),
            (a.Y * aWeight) + (b.Y * bWeight));
    }

    static void AttachBorderIds(Dictionary<string, TerritoryInfo> territories, List<BorderInfo> borders)
    {
        foreach (BorderInfo border in borders)
        {
            territories[border.TerritoryIds[0]].BorderIds.Add(border.Id);
            territories[border.TerritoryIds[1]].BorderIds.Add(border.Id);
        }

        foreach (TerritoryInfo territory in territories.Values)
        {
            territory.BorderIds = territory.BorderIds.OrderBy(id => id, StringComparer.Ordinal).ToList();
        }
    }

    static bool IsPlayableLandConnection(string territoryA, string territoryB, Dictionary<string, TerritoryInfo> territories, Dictionary<string, TerritoryKeyEntry> keyEntries)
    {
        if (!territories[territoryA].Playable || !territories[territoryB].Playable)
        {
            return false;
        }

        return keyEntries[territoryA].LandBorders.Contains(territoryB) &&
            keyEntries[territoryB].LandBorders.Contains(territoryA);
    }

    static string[] OrderedTerritoryPair(string territoryA, string territoryB)
    {
        bool backgroundA = territoryA.StartsWith("background-", StringComparison.Ordinal);
        bool backgroundB = territoryB.StartsWith("background-", StringComparison.Ordinal);
        if (backgroundA && !backgroundB)
        {
            return new string[] { territoryA, territoryB };
        }

        if (backgroundB && !backgroundA)
        {
            return new string[] { territoryB, territoryA };
        }

        return String.CompareOrdinal(territoryA, territoryB) <= 0
            ? new string[] { territoryA, territoryB }
            : new string[] { territoryB, territoryA };
    }

    static string BorderId(string territoryA, string territoryB)
    {
        string[] ordered = OrderedTerritoryPair(territoryA, territoryB);
        return ordered[0] + "__" + ordered[1];
    }

    static string PointKey(PointI point)
    {
        return point.X.ToString(CultureInfo.InvariantCulture) + "," + point.Y.ToString(CultureInfo.InvariantCulture);
    }

    static string PointKey(PointD point)
    {
        return PointNumber(point.X) + "," + PointNumber(point.Y);
    }

    static bool SamePoint(PointI a, PointI b)
    {
        return a.X == b.X && a.Y == b.Y;
    }

    static bool SamePoint(PointD a, PointD b)
    {
        return Math.Abs(a.X - b.X) < 0.000001 && Math.Abs(a.Y - b.Y) < 0.000001;
    }

    static string SegmentKey(PointI a, PointI b)
    {
        string keyA = PointKey(a);
        string keyB = PointKey(b);
        return String.CompareOrdinal(keyA, keyB) <= 0 ? keyA + "|" + keyB : keyB + "|" + keyA;
    }

    static double DistanceSquared(double x1, double y1, double x2, double y2)
    {
        double dx = x1 - x2;
        double dy = y1 - y2;
        return dx * dx + dy * dy;
    }

    static bool[] DetectRed(Bitmap bitmap, int minRed, int redDominance)
    {
        int width = bitmap.Width;
        int height = bitmap.Height;
        bool[] result = new bool[width * height];

        BitmapData data = bitmap.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.ReadOnly,
            PixelFormat.Format24bppRgb);

        try
        {
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] bytes = new byte[byteCount];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, byteCount);

            for (int y = 0; y < height; y++)
            {
                int row = y * stride;
                for (int x = 0; x < width; x++)
                {
                    int offset = row + x * 3;
                    int b = bytes[offset];
                    int g = bytes[offset + 1];
                    int r = bytes[offset + 2];
                    result[y * width + x] = IsRed(r, g, b, minRed, redDominance);
                }
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return result;
    }

    static bool[] DetectRedOrBlue(Bitmap bitmap, int minRed, int redDominance, int minBlue, int blueDominance)
    {
        int width = bitmap.Width;
        int height = bitmap.Height;
        bool[] result = new bool[width * height];

        BitmapData data = bitmap.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.ReadOnly,
            PixelFormat.Format24bppRgb);

        try
        {
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] bytes = new byte[byteCount];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, byteCount);

            for (int y = 0; y < height; y++)
            {
                int row = y * stride;
                for (int x = 0; x < width; x++)
                {
                    int offset = row + x * 3;
                    int b = bytes[offset];
                    int g = bytes[offset + 1];
                    int r = bytes[offset + 2];
                    result[y * width + x] =
                        IsRed(r, g, b, minRed, redDominance) ||
                        IsBlue(r, g, b, minBlue, blueDominance);
                }
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return result;
    }

    static bool IsRed(int r, int g, int b, int minRed, int redDominance)
    {
        return r >= minRed && r - g >= redDominance && r - b >= redDominance;
    }

    static bool IsBlue(int r, int g, int b, int minBlue, int blueDominance)
    {
        return b >= minBlue && b - r >= blueDominance && b - g >= blueDominance;
    }

    static bool[] Dilate(bool[] source, int width, int height, int radius)
    {
        if (radius <= 0)
        {
            return (bool[])source.Clone();
        }

        bool[] result = new bool[source.Length];

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                if (!source[y * width + x])
                {
                    continue;
                }

                for (int dy = -radius; dy <= radius; dy++)
                {
                    int ny = y + dy;
                    if (ny < 0 || ny >= height)
                    {
                        continue;
                    }

                    for (int dx = -radius; dx <= radius; dx++)
                    {
                        int nx = x + dx;
                        if (nx < 0 || nx >= width)
                        {
                            continue;
                        }

                        result[ny * width + nx] = true;
                    }
                }
            }
        }

        return result;
    }

    static ComponentResult LabelComponents(bool[] barrier, int width, int height)
    {
        int[] labels = Enumerable.Repeat(-1, width * height).ToArray();
        Dictionary<int, int> areas = new Dictionary<int, int>();
        Queue<int> queue = new Queue<int>();
        int nextLabel = 0;

        for (int start = 0; start < labels.Length; start++)
        {
            if (barrier[start] || labels[start] >= 0)
            {
                continue;
            }

            labels[start] = nextLabel;
            queue.Enqueue(start);
            int area = 0;

            while (queue.Count > 0)
            {
                int index = queue.Dequeue();
                area++;
                int x = index % width;
                int y = index / width;

                for (int i = 0; i < 4; i++)
                {
                    int nx = x + DirX[i];
                    int ny = y + DirY[i];
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height)
                    {
                        continue;
                    }

                    int next = ny * width + nx;
                    if (!barrier[next] && labels[next] < 0)
                    {
                        labels[next] = nextLabel;
                        queue.Enqueue(next);
                    }
                }
            }

            areas[nextLabel] = area;
            nextLabel++;
        }

        return new ComponentResult { Labels = labels, Areas = areas };
    }

    static void RemoveTinyComponents(int[] labels, Dictionary<int, int> areas, int minComponentArea)
    {
        if (minComponentArea <= 0)
        {
            return;
        }

        for (int i = 0; i < labels.Length; i++)
        {
            int label = labels[i];
            if (label >= 0 && areas[label] < minComponentArea)
            {
                labels[i] = -1;
            }
        }
    }

    static ComponentResult RelabelFromLabels(int[] sourceLabels, int width, int height)
    {
        bool[] barrier = new bool[sourceLabels.Length];
        for (int i = 0; i < sourceLabels.Length; i++)
        {
            barrier[i] = sourceLabels[i] < 0;
        }

        return LabelComponents(barrier, width, height);
    }

    static List<ComponentStats> CalculateComponentStats(int[] labels, Dictionary<int, int> areas, int width)
    {
        Dictionary<int, double> sumX = new Dictionary<int, double>();
        Dictionary<int, double> sumY = new Dictionary<int, double>();

        foreach (int label in areas.Keys)
        {
            sumX[label] = 0;
            sumY[label] = 0;
        }

        for (int i = 0; i < labels.Length; i++)
        {
            int label = labels[i];
            if (label < 0)
            {
                continue;
            }

            sumX[label] += i % width;
            sumY[label] += i / width;
        }

        return areas.Keys
            .OrderBy(k => k)
            .Select(k => new ComponentStats
            {
                Label = k,
                Area = areas[k],
                CentroidX = sumX[k] / areas[k],
                CentroidY = sumY[k] / areas[k]
            })
            .ToList();
    }

    static int FindNearestComponentLabel(int[] labels, int width, int height, int seedX, int seedY, int searchRadius)
    {
        if (seedX >= 0 && seedX < width && seedY >= 0 && seedY < height)
        {
            int direct = labels[seedY * width + seedX];
            if (direct >= 0)
            {
                return direct;
            }
        }

        int bestLabel = -1;
        int bestDistance = int.MaxValue;

        for (int radius = 1; radius <= searchRadius; radius++)
        {
            int minX = Math.Max(0, seedX - radius);
            int maxX = Math.Min(width - 1, seedX + radius);
            int minY = Math.Max(0, seedY - radius);
            int maxY = Math.Min(height - 1, seedY + radius);

            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    if (x != minX && x != maxX && y != minY && y != maxY)
                    {
                        continue;
                    }

                    int label = labels[y * width + x];
                    if (label < 0)
                    {
                        continue;
                    }

                    int dx = x - seedX;
                    int dy = y - seedY;
                    int distance = dx * dx + dy * dy;
                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        bestLabel = label;
                    }
                }
            }

            if (bestLabel >= 0)
            {
                return bestLabel;
            }
        }

        return -1;
    }

    static int[] FillBarriersByNearestComponent(int[] componentLabels, int width, int height)
    {
        bool[] allPixels = Enumerable.Repeat(true, componentLabels.Length).ToArray();
        return FillMaskedBarriersByNearestComponent(componentLabels, allPixels, width, height);
    }

    static int[] FillMaskedBarriersByNearestComponent(int[] componentLabels, bool[] fillMask, int width, int height)
    {
        int[] filled = (int[])componentLabels.Clone();
        Queue<int> queue = new Queue<int>();

        for (int i = 0; i < filled.Length; i++)
        {
            if (fillMask[i] && filled[i] >= 0)
            {
                queue.Enqueue(i);
            }
        }

        while (queue.Count > 0)
        {
            int index = queue.Dequeue();
            int x = index % width;
            int y = index / width;

            for (int i = 0; i < 4; i++)
            {
                int nx = x + DirX[i];
                int ny = y + DirY[i];
                if (nx < 0 || nx >= width || ny < 0 || ny >= height)
                {
                    continue;
                }

                int next = ny * width + nx;
                if (fillMask[next] && filled[next] < 0)
                {
                    filled[next] = filled[index];
                    queue.Enqueue(next);
                }
            }
        }

        for (int i = 0; i < filled.Length; i++)
        {
            if (fillMask[i] && filled[i] < 0)
            {
                throw new InvalidOperationException("Barrier fill left an unlabeled pixel.");
            }
        }

        return filled;
    }

    static string[] ProjectPixelsToRegions(int[] filledComponentLabels, Dictionary<int, string> componentRegionIds)
    {
        string[] regionIds = new string[filledComponentLabels.Length];
        for (int i = 0; i < filledComponentLabels.Length; i++)
        {
            int label = filledComponentLabels[i];
            string regionId;
            if (!componentRegionIds.TryGetValue(label, out regionId))
            {
                throw new InvalidOperationException("Filled component label has no region id: " + label.ToString(CultureInfo.InvariantCulture));
            }

            regionIds[i] = regionId;
        }

        return regionIds;
    }

    static Dictionary<string, TerritoryKeyEntry> ReadTerritoryKey(string path)
    {
        Dictionary<string, TerritoryKeyEntry> entries = new Dictionary<string, TerritoryKeyEntry>();
        bool inIndex = false;

        foreach (string rawLine in File.ReadAllLines(path))
        {
            string line = rawLine.Trim();
            if (line == "## Alphabetical Territory Index")
            {
                inIndex = true;
                continue;
            }

            if (!inIndex)
            {
                continue;
            }

            if (line.StartsWith("## ", StringComparison.Ordinal))
            {
                break;
            }

            if (!line.StartsWith("|", StringComparison.Ordinal) || line.Contains("---") || line.Contains("Territory | Region"))
            {
                continue;
            }

            string[] parts = line.Trim('|').Split('|').Select(p => p.Trim()).ToArray();
            if (parts.Length < 4)
            {
                continue;
            }

            string id = Slug(parts[0]);
            entries[id] = new TerritoryKeyEntry
            {
                Id = id,
                Name = parts[0],
                RegionId = Slug(parts[1]),
                LandBorders = ParseBorderList(parts[2]),
                ShipBorders = ParseBorderList(parts[3])
            };
        }

        return entries;
    }

    static string[] ParseBorderList(string value)
    {
        if (value == "None" || String.IsNullOrWhiteSpace(value))
        {
            return new string[0];
        }

        return value.Split(',')
            .Select(v => v.Trim())
            .Where(v => v.Length > 0)
            .Select(Slug)
            .ToArray();
    }

    static string Slug(string value)
    {
        string lower = value.Trim().ToLowerInvariant();
        lower = Regex.Replace(lower, @"[^a-z0-9]+", "-");
        return lower.Trim('-');
    }

    static void ValidateTerritoryCatalog(Dictionary<string, TerritoryKeyEntry> keyEntries)
    {
        if (TerritorySeeds.Length != 42)
        {
            throw new InvalidOperationException("Expected 42 territory seeds but found " + TerritorySeeds.Length.ToString(CultureInfo.InvariantCulture) + ".");
        }

        if (keyEntries.Count != 42)
        {
            throw new InvalidOperationException("Expected 42 territory-key rows but found " + keyEntries.Count.ToString(CultureInfo.InvariantCulture) + ".");
        }

        foreach (TerritorySeed seed in TerritorySeeds)
        {
            TerritoryKeyEntry entry;
            if (!keyEntries.TryGetValue(seed.Id, out entry))
            {
                throw new InvalidOperationException("Territory seed missing from key: " + seed.Id);
            }

            if (entry.RegionId != seed.RegionId)
            {
                throw new InvalidOperationException("Territory seed region differs from key for " + seed.Id + ".");
            }
        }

        foreach (TerritoryKeyEntry entry in keyEntries.Values)
        {
            if (!TerritorySeeds.Any(s => s.Id == entry.Id))
            {
                throw new InvalidOperationException("Territory-key row has no seed: " + entry.Id);
            }

            foreach (string neighbor in entry.LandBorders)
            {
                TerritoryKeyEntry neighborEntry;
                if (!keyEntries.TryGetValue(neighbor, out neighborEntry))
                {
                    throw new InvalidOperationException(entry.Id + " has unknown land border " + neighbor + ".");
                }

                if (!neighborEntry.LandBorders.Contains(entry.Id))
                {
                    throw new InvalidOperationException(entry.Id + " land border is not reciprocal with " + neighbor + ".");
                }
            }

            foreach (string neighbor in entry.ShipBorders)
            {
                TerritoryKeyEntry neighborEntry;
                if (!keyEntries.TryGetValue(neighbor, out neighborEntry))
                {
                    throw new InvalidOperationException(entry.Id + " has unknown ship border " + neighbor + ".");
                }

                if (!neighborEntry.ShipBorders.Contains(entry.Id))
                {
                    throw new InvalidOperationException(entry.Id + " ship border is not reciprocal with " + neighbor + ".");
                }
            }
        }

        foreach (RegionConfig region in RegionConfigs)
        {
            int seedCount = TerritorySeeds.Count(s => s.RegionId == region.Id);
            if (seedCount != region.TerritoryIds.Length)
            {
                throw new InvalidOperationException(region.Name + " seed count does not match expected territory count.");
            }
        }
    }

    static void ValidateTerritoryGrid(string[] territoryIds, Dictionary<string, TerritoryInfo> territories, int width, int height)
    {
        if (territories.Count != 45)
        {
            throw new InvalidOperationException("Expected 45 territories but found " + territories.Count.ToString(CultureInfo.InvariantCulture) + ".");
        }

        if (territories.Values.Count(t => t.Playable) != 42 || territories.Values.Count(t => !t.Playable) != 3)
        {
            throw new InvalidOperationException("Expected 42 playable territories and 3 background territories.");
        }

        for (int i = 0; i < territoryIds.Length; i++)
        {
            if (territoryIds[i] == null)
            {
                throw new InvalidOperationException("Pixel was not assigned to a territory at " + (i % width).ToString(CultureInfo.InvariantCulture) + "," + (i / width).ToString(CultureInfo.InvariantCulture) + ".");
            }

            if (!territories.ContainsKey(territoryIds[i]))
            {
                throw new InvalidOperationException("Pixel was assigned to unknown territory " + territoryIds[i] + ".");
            }
        }
    }

    static void ValidateBorders(Dictionary<string, TerritoryInfo> territories, List<BorderInfo> borders, Dictionary<string, TerritoryKeyEntry> keyEntries, int mapWidth, int mapHeight)
    {
        HashSet<string> borderIds = new HashSet<string>();
        foreach (BorderInfo border in borders)
        {
            if (!borderIds.Add(border.Id))
            {
                throw new InvalidOperationException("Duplicate border object: " + border.Id);
            }

            if (border.TerritoryIds.Length != 2 || border.TerritoryIds[0] == border.TerritoryIds[1])
            {
                throw new InvalidOperationException("Border must reference exactly two distinct territories: " + border.Id);
            }

            if (border.Paths.Count == 0 || border.Paths.Any(path => path.Count < 2))
            {
                throw new InvalidOperationException("Border has an empty path: " + border.Id);
            }

            foreach (List<PointD> path in border.Paths)
            {
                foreach (PointD point in path)
                {
                    if (Double.IsNaN(point.X) || Double.IsNaN(point.Y) || Double.IsInfinity(point.X) || Double.IsInfinity(point.Y))
                    {
                        throw new InvalidOperationException("Border has an invalid coordinate: " + border.Id);
                    }

                    if (point.X < 0 || point.Y < 0 || point.X > mapWidth || point.Y > mapHeight)
                    {
                        throw new InvalidOperationException("Border coordinate is outside the map: " + border.Id);
                    }
                }
            }

            bool expectedPlayable = IsPlayableLandConnection(border.TerritoryIds[0], border.TerritoryIds[1], territories, keyEntries);
            if (border.IsPlayableConnection != expectedPlayable)
            {
                throw new InvalidOperationException("Border playable flag is wrong: " + border.Id);
            }
        }

        foreach (TerritoryInfo territory in territories.Values)
        {
            foreach (string borderId in territory.BorderIds)
            {
                if (!borderIds.Contains(borderId))
                {
                    throw new InvalidOperationException(territory.Id + " references unknown border " + borderId + ".");
                }
            }
        }

        foreach (BorderInfo border in borders)
        {
            int referenceCount = territories.Values.Count(t => t.BorderIds.Contains(border.Id));
            if (referenceCount != 2)
            {
                throw new InvalidOperationException("Border " + border.Id + " should be referenced by exactly two territories but is referenced by " + referenceCount.ToString(CultureInfo.InvariantCulture) + ".");
            }

            if (!territories[border.TerritoryIds[0]].BorderIds.Contains(border.Id) || !territories[border.TerritoryIds[1]].BorderIds.Contains(border.Id))
            {
                throw new InvalidOperationException("Border " + border.Id + " is not referenced by both listed territories.");
            }
        }

        List<string> missingLandBorders = new List<string>();
        List<string> physicalShipBorders = new List<string>();
        foreach (TerritoryKeyEntry entry in keyEntries.Values)
        {
            foreach (string neighbor in entry.LandBorders)
            {
                string borderId = BorderId(entry.Id, neighbor);
                if (!borderIds.Contains(borderId))
                {
                    missingLandBorders.Add(borderId);
                }
            }

            foreach (string neighbor in entry.ShipBorders)
            {
                string borderId = BorderId(entry.Id, neighbor);
                if (borderIds.Contains(borderId))
                {
                    physicalShipBorders.Add(borderId);
                }
            }
        }

        if (missingLandBorders.Count > 0)
        {
            string[] missing = missingLandBorders.Distinct().OrderBy(id => id).ToArray();
            string[] related = borders
                .Where(border => missing.Any(id => id.Split(new string[] { "__" }, StringSplitOptions.None).Any(part => border.TerritoryIds.Contains(part))))
                .Select(border => border.Id)
                .Distinct()
                .OrderBy(id => id)
                .ToArray();
            throw new InvalidOperationException("Land connections have no physical border: " + String.Join(", ", missing) + ". Related physical borders: " + String.Join(", ", related) + ".");
        }

        if (physicalShipBorders.Count > 0)
        {
            throw new InvalidOperationException("Ship connections were emitted as physical borders: " + String.Join(", ", physicalShipBorders.Distinct().OrderBy(id => id).ToArray()) + ".");
        }
    }

    static int RegionSortKey(string id)
    {
        switch (id)
        {
            case "eriador": return 0;
            case "rhovanion": return 1;
            case "rhun": return 2;
            case "rohan": return 3;
            case "mordor": return 4;
            case "gondor": return 5;
            case "background": return 6;
            default: return 7;
        }
    }

    static int TerritorySortKey(string id)
    {
        for (int i = 0; i < TerritorySeeds.Length; i++)
        {
            if (TerritorySeeds[i].Id == id)
            {
                return i;
            }
        }

        for (int i = 0; i < BackgroundSeeds.Length; i++)
        {
            if (BackgroundSeeds[i].Id == id)
            {
                return 1000 + i;
            }
        }

        return 2000;
    }

    static void WriteMapJson(string outputJson, string inputImage, string territoryKey, int width, int height, int mapScale, Dictionary<string, TerritoryInfo> territories, List<BorderInfo> borders)
    {
        int mapWidth = width * mapScale;
        int mapHeight = height * mapScale;
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("{");
        builder.AppendLine("  \"schema\": \"ardature.map.v1\",");
        builder.AppendLine("  \"source\": {");
        builder.AppendLine("    \"boundaryDrawing\": " + JsonString(RepoPath(inputImage)) + ",");
        builder.AppendLine("    \"territoryKey\": " + JsonString(RepoPath(territoryKey)));
        builder.AppendLine("  },");
        builder.AppendLine("  \"coordinateSystem\": {");
        builder.AppendLine("    \"origin\": \"top-left\",");
        builder.AppendLine("    \"unit\": \"map-unit\",");
        builder.AppendLine("    \"width\": " + mapWidth.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"height\": " + mapHeight.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"sourceImageWidth\": " + width.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"sourceImageHeight\": " + height.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"sourcePixelScale\": " + mapScale.ToString(CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"regions\": [");

        List<RegionConfig> playableRegions = RegionConfigs.OrderBy(r => RegionSortKey(r.Id)).ToList();
        for (int i = 0; i < playableRegions.Count; i++)
        {
            RegionConfig region = playableRegions[i];
            WriteRegionJson(builder, region.Id, region.Name, true, region.TerritoryIds, territories, false);
        }

        WriteRegionJson(builder, "background", "Background", false, BackgroundSeeds.Select(s => s.Id).ToArray(), territories, true);
        builder.AppendLine("  ],");
        builder.AppendLine("  \"borders\": [");

        for (int i = 0; i < borders.Count; i++)
        {
            WriteBorderJson(builder, borders[i], i == borders.Count - 1);
        }

        builder.AppendLine("  ]");
        builder.AppendLine("}");

        File.WriteAllText(outputJson, builder.ToString(), new UTF8Encoding(false));
    }

    static void WriteRegionJson(StringBuilder builder, string id, string name, bool playable, string[] territoryIds, Dictionary<string, TerritoryInfo> territories, bool last)
    {
        builder.AppendLine("    {");
        builder.AppendLine("      \"id\": " + JsonString(id) + ",");
        builder.AppendLine("      \"name\": " + JsonString(name) + ",");
        builder.AppendLine("      \"playable\": " + BoolJson(playable) + ",");
        builder.AppendLine("      \"territories\": [");

        for (int i = 0; i < territoryIds.Length; i++)
        {
            WriteTerritoryJson(builder, territories[territoryIds[i]], i == territoryIds.Length - 1);
        }

        builder.AppendLine("      ]");
        builder.AppendLine("    }" + (last ? "" : ","));
    }

    static void WriteTerritoryJson(StringBuilder builder, TerritoryInfo territory, bool last)
    {
        builder.AppendLine("        {");
        builder.AppendLine("          \"id\": " + JsonString(territory.Id) + ",");
        builder.AppendLine("          \"name\": " + JsonString(territory.Name) + ",");
        builder.AppendLine("          \"playable\": " + BoolJson(territory.Playable) + ",");
        builder.AppendLine("          \"borderIds\": " + StringArrayJson(territory.BorderIds.ToArray()) + ",");
        builder.AppendLine("          \"landConnections\": " + StringArrayJson(territory.LandConnections) + ",");
        builder.AppendLine("          \"shipConnections\": " + StringArrayJson(territory.ShipConnections));
        builder.AppendLine("        }" + (last ? "" : ","));
    }

    static void WriteBorderJson(StringBuilder builder, BorderInfo border, bool last)
    {
        builder.AppendLine("    {");
        builder.AppendLine("      \"id\": " + JsonString(border.Id) + ",");
        builder.AppendLine("      \"territoryIds\": " + StringArrayJson(border.TerritoryIds) + ",");
        builder.AppendLine("      \"isPlayableConnection\": " + BoolJson(border.IsPlayableConnection) + ",");
        builder.AppendLine("      \"paths\": " + PathsJson(border.Paths));
        builder.AppendLine("    }" + (last ? "" : ","));
    }

    static string PathsJson(List<List<PointD>> paths)
    {
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("[");
        for (int i = 0; i < paths.Count; i++)
        {
            builder.Append("        ");
            builder.Append(PointsJson(paths[i]));
            builder.AppendLine(i == paths.Count - 1 ? "" : ",");
        }
        builder.Append("      ]");
        return builder.ToString();
    }

    static string PointsJson(List<PointD> points)
    {
        StringBuilder builder = new StringBuilder();
        builder.Append("[");
        for (int i = 0; i < points.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(", ");
            }

            builder.Append("[");
            builder.Append(PointNumber(points[i].X));
            builder.Append(",");
            builder.Append(PointNumber(points[i].Y));
            builder.Append("]");
        }
        builder.Append("]");
        return builder.ToString();
    }

    static void WriteTerritoriesSvg(string outputSvg, string previewBaseImage, int width, int height, int mapScale, Dictionary<string, TerritoryInfo> territories, List<BorderInfo> borders)
    {
        int mapWidth = width * mapScale;
        int mapHeight = height * mapScale;
        string href = RelativePath(Path.GetDirectoryName(outputSvg), previewBaseImage).Replace('\\', '/');
        Dictionary<string, BorderInfo> borderById = borders.ToDictionary(border => border.Id);
        StringBuilder builder = new StringBuilder();

        builder.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        builder.AppendLine("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width.ToString(CultureInfo.InvariantCulture) + "\" height=\"" + height.ToString(CultureInfo.InvariantCulture) + "\" viewBox=\"0 0 " + mapWidth.ToString(CultureInfo.InvariantCulture) + " " + mapHeight.ToString(CultureInfo.InvariantCulture) + "\">");
        builder.AppendLine("  <rect x=\"0\" y=\"0\" width=\"" + mapWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"" + mapHeight.ToString(CultureInfo.InvariantCulture) + "\" fill=\"#f8f6ec\"/>");
        builder.AppendLine("  <image href=\"" + href + "\" x=\"0\" y=\"0\" width=\"" + mapWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"" + mapHeight.ToString(CultureInfo.InvariantCulture) + "\" opacity=\"0.36\"/>");

        foreach (TerritoryInfo territory in territories.Values.Where(t => t.Playable).OrderBy(t => TerritorySortKey(t.Id)))
        {
            string color = ColorForTerritory(territory);
            foreach (List<PointD> loop in BuildTerritoryLoops(territory, borderById))
            {
                if (loop.Count >= 3)
                {
                    builder.AppendLine("  <path d=\"" + SvgPath(loop, true) + "\" fill=\"" + color + "\" fill-opacity=\"0.46\" stroke=\"none\"/>");
                }
            }
        }

        foreach (BorderInfo border in borders)
        {
            foreach (List<PointD> path in border.Paths)
            {
                builder.AppendLine("  <path d=\"" + SvgPath(path, false) + "\" fill=\"none\" stroke=\"#1f2933\" stroke-width=\"0.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" vector-effect=\"non-scaling-stroke\"/>");
            }
        }

        builder.AppendLine("</svg>");
        File.WriteAllText(outputSvg, builder.ToString(), new UTF8Encoding(false));
    }

    static List<List<PointD>> BuildTerritoryLoops(TerritoryInfo territory, Dictionary<string, BorderInfo> borderById)
    {
        List<PathPiece> pieces = CollectTerritoryPathPieces(territory, borderById);
        List<List<PointD>> loops = new List<List<PointD>>();

        // Walk canonical border pieces into one or more closed fill loops.
        while (true)
        {
            PathPiece first = pieces.FirstOrDefault(piece => !piece.Used);
            if (first == null)
            {
                break;
            }

            first.Used = true;
            List<PointD> loop = new List<PointD>(first.Points);

            while (!SamePoint(loop[0], loop[loop.Count - 1]))
            {
                if (!TryAppendNextPiece(territory, pieces, loop))
                {
                    throw new InvalidOperationException("Territory " + territory.Id + " has a border loop that does not close at " + PointKey(loop[loop.Count - 1]) + ".");
                }
            }

            loops.Add(loop);
        }

        if (pieces.Any(piece => !piece.Used))
        {
            throw new InvalidOperationException("Territory " + territory.Id + " has unused border pieces after loop assembly.");
        }

        return loops;
    }

    static List<PathPiece> CollectTerritoryPathPieces(TerritoryInfo territory, Dictionary<string, BorderInfo> borderById)
    {
        List<PathPiece> pieces = new List<PathPiece>();

        foreach (string borderId in territory.BorderIds.OrderBy(id => id, StringComparer.Ordinal))
        {
            BorderInfo border;
            if (!borderById.TryGetValue(borderId, out border))
            {
                throw new InvalidOperationException("Territory " + territory.Id + " references unknown border " + borderId + ".");
            }

            for (int i = 0; i < border.Paths.Count; i++)
            {
                pieces.Add(new PathPiece
                {
                    BorderId = borderId,
                    PathIndex = i,
                    Points = border.Paths[i],
                    Used = false
                });
            }
        }

        if (pieces.Count == 0)
        {
            throw new InvalidOperationException("Territory " + territory.Id + " has no border pieces.");
        }

        return pieces;
    }

    static bool TryAppendNextPiece(TerritoryInfo territory, List<PathPiece> pieces, List<PointD> loop)
    {
        string endKey = PointKey(loop[loop.Count - 1]);
        PathPiece match = null;
        bool reverse = false;
        int matchCount = 0;

        // Find the one unused piece that continues this territory boundary.
        foreach (PathPiece piece in pieces)
        {
            if (piece.Used)
            {
                continue;
            }

            bool matchesStart = PointKey(piece.Points[0]) == endKey;
            bool matchesEnd = PointKey(piece.Points[piece.Points.Count - 1]) == endKey;
            if (!matchesStart && !matchesEnd)
            {
                continue;
            }

            match = piece;
            reverse = matchesEnd && !matchesStart;
            matchCount++;
        }

        if (matchCount == 0)
        {
            return false;
        }

        if (matchCount > 1)
        {
            throw new InvalidOperationException("Territory " + territory.Id + " has an ambiguous border continuation at " + endKey + ".");
        }

        List<PointD> points = reverse ? ReversedPath(match.Points) : match.Points;
        for (int i = 1; i < points.Count; i++)
        {
            loop.Add(points[i]);
        }

        match.Used = true;
        return true;
    }

    static List<PointD> ReversedPath(List<PointD> points)
    {
        List<PointD> result = new List<PointD>(points);
        result.Reverse();
        return result;
    }

    static string SvgPath(List<PointD> points, bool close)
    {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < points.Count; i++)
        {
            builder.Append(i == 0 ? "M " : " L ");
            builder.Append(PointNumber(points[i].X));
            builder.Append(" ");
            builder.Append(PointNumber(points[i].Y));
        }

        if (close)
        {
            builder.Append(" Z");
        }

        return builder.ToString();
    }

    static string ColorForTerritory(TerritoryInfo territory)
    {
        RegionConfig region = RegionConfigs.First(config => config.Id == territory.RegionId);
        Color baseColor = ColorTranslator.FromHtml(region.Color);
        int order = TerritorySortKey(territory.Id);
        double factor = 0.86 + ((order % 5) * 0.07);
        int red = ClampColor(baseColor.R * factor);
        int green = ClampColor(baseColor.G * factor);
        int blue = ClampColor(baseColor.B * factor);
        return ColorTranslator.ToHtml(Color.FromArgb(red, green, blue));
    }

    static string PointNumber(double value)
    {
        return value.ToString("0.###", CultureInfo.InvariantCulture);
    }

    static int ClampColor(double value)
    {
        if (value < 0)
        {
            return 0;
        }

        if (value > 255)
        {
            return 255;
        }

        return (int)Math.Round(value);
    }

    static string NormalizePath(string value)
    {
        return value.Replace('\\', '/');
    }

    static string RepoPath(string value)
    {
        return NormalizePath(RelativePath(Directory.GetCurrentDirectory(), value));
    }

    static string JsonString(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    static string BoolJson(bool value)
    {
        return value ? "true" : "false";
    }

    static string StringArrayJson(string[] values)
    {
        if (values.Length == 0)
        {
            return "[]";
        }

        return "[" + String.Join(", ", values.Select(JsonString).ToArray()) + "]";
    }

    static string RelativePath(string fromDirectory, string toPath)
    {
        Uri from = new Uri(AppendDirectorySeparator(Path.GetFullPath(fromDirectory)));
        Uri to = new Uri(Path.GetFullPath(toPath));
        return Uri.UnescapeDataString(from.MakeRelativeUri(to).ToString());
    }

    static string AppendDirectorySeparator(string path)
    {
        if (path.EndsWith(Path.DirectorySeparatorChar.ToString()) || path.EndsWith(Path.AltDirectorySeparatorChar.ToString()))
        {
            return path;
        }

        return path + Path.DirectorySeparatorChar;
    }
}
'@

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Drawing.dll"

[MapExtractor]::Extract(
  $inputPath,
  $territoryKeyPath,
  $jsonPath,
  $previewBasePath,
  $previewSvgPath,
  $MinRed,
  $RedDominance,
  $MinBlue,
  $BlueDominance,
  $RegionBarrierDilateRadius,
  $TerritoryBarrierDilateRadius,
  $MinComponentArea,
  $MapScale,
  $SmoothPasses,
  $SimplifyTolerance)
