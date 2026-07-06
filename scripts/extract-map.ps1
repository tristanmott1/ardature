param(
  [string]$InputImage = "maps/source/territory-boundaries.jpeg",
  [string]$TerritoryKey = "maps/territory-key.md",
  [string]$PreviewBaseImage = "maps/source/middle-earth-reference.jpg",
  [string]$RegionsJson = "maps/geometry/regions.json",
  [string]$TerritoriesJson = "maps/geometry/territories.json",
  [string]$TerritoriesSvg = "maps/previews/territories.svg",
  [int]$MinRed = 150,
  [int]$RedDominance = 45,
  [int]$MinBlue = 120,
  [int]$BlueDominance = 35,
  [int]$RegionBarrierDilateRadius = 1,
  [int]$TerritoryBarrierDilateRadius = 2,
  [int]$MinComponentArea = 100,
  [int]$MinHoleArea = 30,
  [double]$SimplifyTolerance = 0.85
)

$ErrorActionPreference = "Stop"

$inputPath = (Resolve-Path $InputImage).Path
$territoryKeyPath = (Resolve-Path $TerritoryKey).Path
$previewBasePath = (Resolve-Path $PreviewBaseImage).Path
$regionsJsonPath = Join-Path (Get-Location) $RegionsJson
$territoriesJsonPath = Join-Path (Get-Location) $TerritoriesJson
$territoriesSvgPath = Join-Path (Get-Location) $TerritoriesSvg

New-Item -ItemType Directory -Force -Path (Split-Path $regionsJsonPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $territoriesJsonPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $territoriesSvgPath) | Out-Null

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
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

    class Bounds
    {
        public double MinX;
        public double MinY;
        public double MaxX;
        public double MaxY;
    }

    class RegionSeed
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

    class TerritorySeed
    {
        public string Id;
        public string Name;
        public string RegionId;
        public int X;
        public int Y;
    }

    class TerritoryKeyEntry
    {
        public string Id;
        public string Name;
        public string RegionId;
        public string[] LandBorders;
        public string[] ShipBorders;
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

    class TerritoryShape
    {
        public string Id;
        public string Name;
        public string RegionId;
        public string[] LandBorders;
        public string[] ShipBorders;
        public int PixelArea;
        public Bounds Bounds;
        public PointD Centroid;
        public List<TerritoryPolygon> Polygons = new List<TerritoryPolygon>();
    }

    class RegionShape
    {
        public string Id;
        public string Name;
        public int PixelArea;
        public Bounds Bounds;
        public PointD Centroid;
        public List<RegionPolygon> Polygons = new List<RegionPolygon>();
    }

    class RegionPolygon
    {
        public string Id;
        public int PixelArea;
        public double PolygonArea;
        public Bounds Bounds;
        public PointD Centroid;
        public List<PointD> Ring;
        public List<PointD> RawRing;
    }

    class TerritoryPolygon
    {
        public string Id;
        public int PixelArea;
        public double PolygonArea;
        public Bounds Bounds;
        public PointD Centroid;
        public List<PointD> Ring;
        public List<PointD> RawRing;
        public List<List<PointD>> Holes = new List<List<PointD>>();
        public List<List<PointD>> RawHoles = new List<List<PointD>>();
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
        string previewBaseImage,
        string regionsJson,
        string territoriesJson,
        string territoriesSvg,
        int minRed,
        int redDominance,
        int minBlue,
        int blueDominance,
        int regionBarrierDilateRadius,
        int territoryBarrierDilateRadius,
        int minComponentArea,
        int minHoleArea,
        double simplifyTolerance)
    {
        Dictionary<string, TerritoryKeyEntry> keyEntries = ReadTerritoryKey(territoryKey);
        ValidateTerritoryCatalog(keyEntries);

        using (var sourceBitmap = new Bitmap(inputImage))
        {
            int width = sourceBitmap.Width;
            int height = sourceBitmap.Height;
            string[] regionIds = BuildRegionPixelModel(sourceBitmap, width, height, minRed, redDominance, regionBarrierDilateRadius, minComponentArea);
            string[] territoryIds = new string[width * height];

            foreach (RegionConfig region in RegionConfigs)
            {
                ProcessRegionDrawing(
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

            ValidateTerritoryCoverage(territoryIds, regionIds, width, height);
            List<RegionShape> regions = ExtractRegionShapes(regionIds, width, height, simplifyTolerance);
            List<TerritoryShape> shapes = ExtractTerritoryShapes(territoryIds, keyEntries, width, height, simplifyTolerance, minHoleArea);

            ValidateRegions(regions, width, height);
            ValidateExtractedShapes(shapes, keyEntries, territoryIds, regionIds, width, height);
            WriteRegionsJson(regionsJson, inputImage, width, height, minRed, redDominance, regionBarrierDilateRadius, minComponentArea, simplifyTolerance, regions);
            WriteTerritoriesJson(territoriesJson, inputImage, territoryKey, width, height, minRed, redDominance, minBlue, blueDominance, regionBarrierDilateRadius, territoryBarrierDilateRadius, minComponentArea, minHoleArea, simplifyTolerance, shapes);
            WriteTerritoriesSvg(territoriesSvg, previewBaseImage, width, height, shapes);

            Console.WriteLine("Image: " + width.ToString(CultureInfo.InvariantCulture) + "x" + height.ToString(CultureInfo.InvariantCulture));
            foreach (RegionShape region in regions.OrderBy(r => RegionSortKey(r.Id)))
            {
                Console.WriteLine(region.Name + ": " + region.Polygons.Count.ToString(CultureInfo.InvariantCulture) + " region polygon(s), " + region.PixelArea.ToString(CultureInfo.InvariantCulture) + " pixels");
            }
            foreach (RegionConfig region in RegionConfigs)
            {
                int count = shapes.Count(s => s.RegionId == region.Id);
                int pixels = shapes.Where(s => s.RegionId == region.Id).Sum(s => s.PixelArea);
                Console.WriteLine(region.Name + ": " + count.ToString(CultureInfo.InvariantCulture) + " territories, " + pixels.ToString(CultureInfo.InvariantCulture) + " pixels");
            }
            Console.WriteLine("Total territories: " + shapes.Count.ToString(CultureInfo.InvariantCulture));
            Console.WriteLine("Regions JSON: " + regionsJson);
            Console.WriteLine("Territories JSON: " + territoriesJson);
            Console.WriteLine("Territories preview: " + territoriesSvg);
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

    static void ProcessRegionDrawing(
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
            string details = String.Join("; ", stats.Select(s => s.Label.ToString(CultureInfo.InvariantCulture) + " area=" + s.Area.ToString(CultureInfo.InvariantCulture) + " center=(" + s.CentroidX.ToString("0.0", CultureInfo.InvariantCulture) + "," + s.CentroidY.ToString("0.0", CultureInfo.InvariantCulture) + ")").ToArray());
            throw new InvalidOperationException(region.Name + " should have at least " + region.TerritoryIds.Length.ToString(CultureInfo.InvariantCulture) + " territory components but has " + stats.Count.ToString(CultureInfo.InvariantCulture) + ". Components: " + details);
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
                string details = String.Join("; ", CalculateComponentStats(components.Labels, components.Areas, width).Select(s => s.Label.ToString(CultureInfo.InvariantCulture) + " area=" + s.Area.ToString(CultureInfo.InvariantCulture) + " center=(" + s.CentroidX.ToString("0.0", CultureInfo.InvariantCulture) + "," + s.CentroidY.ToString("0.0", CultureInfo.InvariantCulture) + ")").ToArray());
                throw new InvalidOperationException("Territory seed " + seed.Id + " maps to a component already used by " + result[label] + ". Components: " + details);
            }

            usedLabels.Add(label);
            result[label] = seed.Id;
        }

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

    static List<RegionShape> ExtractRegionShapes(
        string[] regionIds,
        int width,
        int height,
        double simplifyTolerance)
    {
        List<RegionShape> shapes = new List<RegionShape>();
        List<string> ids = RegionConfigs.Select(r => r.Id).Concat(new string[] { "background" }).ToList();

        foreach (string regionId in ids)
        {
            RegionConfig config = RegionConfigs.FirstOrDefault(r => r.Id == regionId);
            bool[] mask = new bool[regionIds.Length];
            List<int> pixels = new List<int>();

            for (int i = 0; i < regionIds.Length; i++)
            {
                if (regionIds[i] == regionId)
                {
                    mask[i] = true;
                    pixels.Add(i);
                }
            }

            if (pixels.Count == 0)
            {
                throw new InvalidOperationException("Region has no pixels: " + regionId);
            }

            List<List<int>> components = ExtractMaskComponents(mask, width, height);
            RegionShape shape = new RegionShape
            {
                Id = regionId,
                Name = config == null ? "Background" : config.Name,
                PixelArea = pixels.Count,
                Centroid = PixelCentroid(pixels, width)
            };

            int polygonCounter = 1;
            foreach (List<int> componentPixels in components.OrderByDescending(p => p.Count))
            {
                bool[] componentMask = new bool[regionIds.Length];
                foreach (int pixel in componentPixels)
                {
                    componentMask[pixel] = true;
                }

                List<List<PointI>> rawLoopsI = TraceBoundaryRings(componentMask, width, height)
                    .OrderByDescending(loop => Math.Abs(SignedArea(loop.Select(p => new PointD(p.X, p.Y)).ToList())))
                    .ToList();

                if (rawLoopsI.Count == 0)
                {
                    throw new InvalidOperationException("No boundary loop was found for region " + regionId + ".");
                }

                List<PointD> rawRing = PrepareRing(rawLoopsI[0]);
                List<PointD> ring = RemoveCollinearD(SimplifyClosedRing(rawRing, simplifyTolerance));
                RegionPolygon polygon = new RegionPolygon
                {
                    Id = regionId + "-" + polygonCounter.ToString(CultureInfo.InvariantCulture),
                    PixelArea = componentPixels.Count,
                    Ring = ring,
                    RawRing = rawRing,
                    Bounds = CalculateBounds(ring),
                    Centroid = PixelCentroid(componentPixels, width),
                    PolygonArea = Math.Abs(SignedArea(ring))
                };

                shape.Polygons.Add(polygon);
                polygonCounter++;
            }

            shape.Bounds = CalculateBounds(shape.Polygons.SelectMany(p => p.Ring).ToList());
            shapes.Add(shape);
        }

        return shapes
            .OrderBy(s => RegionSortKey(s.Id))
            .ToList();
    }

    static List<TerritoryShape> ExtractTerritoryShapes(
        string[] territoryIds,
        Dictionary<string, TerritoryKeyEntry> keyEntries,
        int width,
        int height,
        double simplifyTolerance,
        int minHoleArea)
    {
        List<TerritoryShape> shapes = new List<TerritoryShape>();

        foreach (TerritorySeed seed in TerritorySeeds)
        {
            TerritoryKeyEntry entry = keyEntries[seed.Id];
            bool[] mask = new bool[territoryIds.Length];
            List<int> pixels = new List<int>();

            for (int i = 0; i < territoryIds.Length; i++)
            {
                if (territoryIds[i] == seed.Id)
                {
                    mask[i] = true;
                    pixels.Add(i);
                }
            }

            if (pixels.Count == 0)
            {
                throw new InvalidOperationException("Territory has no pixels: " + seed.Id);
            }

            List<List<int>> components = ExtractMaskComponents(mask, width, height);
            TerritoryShape shape = new TerritoryShape
            {
                Id = seed.Id,
                Name = entry.Name,
                RegionId = entry.RegionId,
                LandBorders = entry.LandBorders,
                ShipBorders = entry.ShipBorders,
                PixelArea = pixels.Count,
                Centroid = PixelCentroid(pixels, width)
            };

            int polygonCounter = 1;
            foreach (List<int> componentPixels in components.OrderByDescending(p => p.Count))
            {
                bool[] componentMask = new bool[territoryIds.Length];
                foreach (int pixel in componentPixels)
                {
                    componentMask[pixel] = true;
                }

                List<List<PointI>> rawLoopsI = TraceBoundaryRings(componentMask, width, height)
                    .Where(loop => Math.Abs(SignedArea(loop.Select(p => new PointD(p.X, p.Y)).ToList())) >= minHoleArea)
                    .OrderByDescending(loop => Math.Abs(SignedArea(loop.Select(p => new PointD(p.X, p.Y)).ToList())))
                    .ToList();

                if (rawLoopsI.Count == 0)
                {
                    throw new InvalidOperationException("No boundary loop was found for " + seed.Id + ".");
                }

                List<PointD> outerRaw = PrepareRing(rawLoopsI[0]);
                List<PointD> outer = RemoveCollinearD(SimplifyClosedRing(outerRaw, simplifyTolerance));
                TerritoryPolygon polygon = new TerritoryPolygon
                {
                    Id = seed.Id + "-" + polygonCounter.ToString(CultureInfo.InvariantCulture),
                    PixelArea = componentPixels.Count,
                    Ring = outer,
                    RawRing = outerRaw,
                    Centroid = PixelCentroid(componentPixels, width)
                };

                for (int i = 1; i < rawLoopsI.Count; i++)
                {
                    List<PointD> rawHole = PrepareRing(rawLoopsI[i]);
                    List<PointD> hole = RemoveCollinearD(SimplifyClosedRing(rawHole, simplifyTolerance));
                    polygon.RawHoles.Add(rawHole);
                    polygon.Holes.Add(hole);
                }

                polygon.Bounds = CalculateBounds(AllPolygonPoints(polygon));
                polygon.PolygonArea = Math.Abs(SignedArea(polygon.Ring)) - polygon.Holes.Sum(h => Math.Abs(SignedArea(h)));
                shape.Polygons.Add(polygon);
                polygonCounter++;
            }

            shape.Bounds = CalculateBounds(shape.Polygons.SelectMany(p => AllPolygonPoints(p)).ToList());
            shapes.Add(shape);
        }

        return shapes
            .OrderBy(s => RegionSortKey(s.RegionId))
            .ThenBy(s => TerritorySortKey(s.Id))
            .ToList();
    }

    static List<PointD> PrepareRing(List<PointI> rawRingI)
    {
        rawRingI = RemoveConsecutiveDuplicates(rawRingI);
        rawRingI = RemoveCollinear(rawRingI);
        return rawRingI.Select(p => new PointD(p.X, p.Y)).ToList();
    }

    static List<PointD> AllPolygonPoints(TerritoryPolygon polygon)
    {
        List<PointD> points = new List<PointD>();
        points.AddRange(polygon.Ring);
        foreach (List<PointD> hole in polygon.Holes)
        {
            points.AddRange(hole);
        }
        return points;
    }

    static List<List<int>> ExtractMaskComponents(bool[] mask, int width, int height)
    {
        bool[] visited = new bool[mask.Length];
        Queue<int> queue = new Queue<int>();
        List<List<int>> components = new List<List<int>>();

        for (int start = 0; start < mask.Length; start++)
        {
            if (!mask[start] || visited[start])
            {
                continue;
            }

            List<int> pixels = new List<int>();
            visited[start] = true;
            queue.Enqueue(start);

            while (queue.Count > 0)
            {
                int index = queue.Dequeue();
                pixels.Add(index);
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
                    if (mask[next] && !visited[next])
                    {
                        visited[next] = true;
                        queue.Enqueue(next);
                    }
                }
            }

            components.Add(pixels);
        }

        return components;
    }

    static List<List<PointI>> TraceBoundaryRings(bool[] mask, int width, int height)
    {
        List<Segment> segments = new List<Segment>();

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                if (!mask[y * width + x])
                {
                    continue;
                }

                if (IsOutsideMask(mask, width, height, x, y - 1))
                {
                    segments.Add(new Segment(new PointI(x, y), new PointI(x + 1, y)));
                }

                if (IsOutsideMask(mask, width, height, x + 1, y))
                {
                    segments.Add(new Segment(new PointI(x + 1, y), new PointI(x + 1, y + 1)));
                }

                if (IsOutsideMask(mask, width, height, x, y + 1))
                {
                    segments.Add(new Segment(new PointI(x + 1, y + 1), new PointI(x, y + 1)));
                }

                if (IsOutsideMask(mask, width, height, x - 1, y))
                {
                    segments.Add(new Segment(new PointI(x, y + 1), new PointI(x, y)));
                }
            }
        }

        Dictionary<string, Queue<int>> byStart = new Dictionary<string, Queue<int>>();
        for (int i = 0; i < segments.Count; i++)
        {
            string key = Key(segments[i].A);
            Queue<int> list;
            if (!byStart.TryGetValue(key, out list))
            {
                list = new Queue<int>();
                byStart[key] = list;
            }
            list.Enqueue(i);
        }

        bool[] used = new bool[segments.Count];
        List<List<PointI>> loops = new List<List<PointI>>();

        for (int i = 0; i < segments.Count; i++)
        {
            if (used[i])
            {
                continue;
            }

            List<PointI> loop = new List<PointI>();
            Segment segment = segments[i];
            used[i] = true;
            loop.Add(segment.A);
            PointI current = segment.B;

            int guard = 0;
            while (guard < segments.Count + 10)
            {
                guard++;
                loop.Add(current);
                if (current.X == loop[0].X && current.Y == loop[0].Y)
                {
                    break;
                }

                Queue<int> candidates;
                if (!byStart.TryGetValue(Key(current), out candidates))
                {
                    break;
                }

                int nextIndex = -1;
                while (candidates.Count > 0)
                {
                    int candidate = candidates.Dequeue();
                    if (!used[candidate])
                    {
                        nextIndex = candidate;
                        break;
                    }
                }

                if (nextIndex < 0)
                {
                    break;
                }

                used[nextIndex] = true;
                current = segments[nextIndex].B;
            }

            if (loop.Count > 3 && loop[0].X == loop[loop.Count - 1].X && loop[0].Y == loop[loop.Count - 1].Y)
            {
                loop.RemoveAt(loop.Count - 1);
                loops.Add(loop);
            }
        }

        if (loops.Count == 0)
        {
            throw new InvalidOperationException("No closed boundary loop was found.");
        }

        return loops;
    }

    static bool IsOutsideMask(bool[] mask, int width, int height, int x, int y)
    {
        if (x < 0 || x >= width || y < 0 || y >= height)
        {
            return true;
        }

        return !mask[y * width + x];
    }

    static string Key(PointI point)
    {
        return point.X.ToString(CultureInfo.InvariantCulture) + "," + point.Y.ToString(CultureInfo.InvariantCulture);
    }

    static List<PointI> RemoveConsecutiveDuplicates(List<PointI> points)
    {
        List<PointI> result = new List<PointI>();
        foreach (PointI point in points)
        {
            if (result.Count == 0 || result[result.Count - 1].X != point.X || result[result.Count - 1].Y != point.Y)
            {
                result.Add(point);
            }
        }

        if (result.Count > 1 && result[0].X == result[result.Count - 1].X && result[0].Y == result[result.Count - 1].Y)
        {
            result.RemoveAt(result.Count - 1);
        }

        return result;
    }

    static List<PointI> RemoveCollinear(List<PointI> points)
    {
        if (points.Count < 3)
        {
            return points;
        }

        List<PointI> result = new List<PointI>();

        for (int i = 0; i < points.Count; i++)
        {
            PointI previous = points[(i - 1 + points.Count) % points.Count];
            PointI current = points[i];
            PointI next = points[(i + 1) % points.Count];

            int dx1 = current.X - previous.X;
            int dy1 = current.Y - previous.Y;
            int dx2 = next.X - current.X;
            int dy2 = next.Y - current.Y;

            if (dx1 * dy2 - dy1 * dx2 != 0)
            {
                result.Add(current);
            }
        }

        return result;
    }

    static List<PointD> RemoveCollinearD(List<PointD> points)
    {
        if (points.Count < 3)
        {
            return points;
        }

        List<PointD> result = new List<PointD>();

        for (int i = 0; i < points.Count; i++)
        {
            PointD previous = points[(i - 1 + points.Count) % points.Count];
            PointD current = points[i];
            PointD next = points[(i + 1) % points.Count];

            double dx1 = current.X - previous.X;
            double dy1 = current.Y - previous.Y;
            double dx2 = next.X - current.X;
            double dy2 = next.Y - current.Y;

            if (Math.Abs(dx1 * dy2 - dy1 * dx2) > 0.000001)
            {
                result.Add(current);
            }
        }

        return result;
    }

    static List<PointD> SimplifyClosedRing(List<PointD> points, double tolerance)
    {
        if (points.Count <= 3 || tolerance <= 0)
        {
            return new List<PointD>(points);
        }

        int start = 0;
        for (int i = 1; i < points.Count; i++)
        {
            if (points[i].X < points[start].X || (points[i].X == points[start].X && points[i].Y < points[start].Y))
            {
                start = i;
            }
        }

        List<PointD> rotated = new List<PointD>();
        for (int i = 0; i < points.Count; i++)
        {
            rotated.Add(points[(start + i) % points.Count]);
        }
        rotated.Add(rotated[0]);

        bool[] keep = new bool[rotated.Count];
        keep[0] = true;
        keep[rotated.Count - 1] = true;
        SimplifySection(rotated, 0, rotated.Count - 1, tolerance * tolerance, keep);

        List<PointD> result = new List<PointD>();
        for (int i = 0; i < rotated.Count - 1; i++)
        {
            if (keep[i])
            {
                result.Add(rotated[i]);
            }
        }

        return result;
    }

    static void SimplifySection(List<PointD> points, int start, int end, double toleranceSquared, bool[] keep)
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

        if (maxDistance > toleranceSquared && maxIndex >= 0)
        {
            keep[maxIndex] = true;
            SimplifySection(points, start, maxIndex, toleranceSquared, keep);
            SimplifySection(points, maxIndex, end, toleranceSquared, keep);
        }
    }

    static double DistanceToSegmentSquared(PointD point, PointD start, PointD end)
    {
        double dx = end.X - start.X;
        double dy = end.Y - start.Y;

        if (Math.Abs(dx) < 0.000001 && Math.Abs(dy) < 0.000001)
        {
            double sx = point.X - start.X;
            double sy = point.Y - start.Y;
            return sx * sx + sy * sy;
        }

        double t = ((point.X - start.X) * dx + (point.Y - start.Y) * dy) / (dx * dx + dy * dy);
        if (t < 0)
        {
            t = 0;
        }
        else if (t > 1)
        {
            t = 1;
        }

        double px = start.X + t * dx;
        double py = start.Y + t * dy;
        double diffX = point.X - px;
        double diffY = point.Y - py;
        return diffX * diffX + diffY * diffY;
    }

    static double SignedArea(List<PointD> points)
    {
        double area = 0;
        for (int i = 0; i < points.Count; i++)
        {
            PointD a = points[i];
            PointD b = points[(i + 1) % points.Count];
            area += a.X * b.Y - b.X * a.Y;
        }

        return area / 2.0;
    }

    static Bounds CalculateBounds(List<PointD> points)
    {
        return new Bounds
        {
            MinX = points.Min(p => p.X),
            MinY = points.Min(p => p.Y),
            MaxX = points.Max(p => p.X),
            MaxY = points.Max(p => p.Y)
        };
    }

    static PointD PixelCentroid(List<int> pixels, int width)
    {
        double sumX = 0;
        double sumY = 0;
        foreach (int pixel in pixels)
        {
            sumX += (pixel % width) + 0.5;
            sumY += (pixel / width) + 0.5;
        }

        return new PointD(sumX / pixels.Count, sumY / pixels.Count);
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

    static void ValidateTerritoryCoverage(string[] territoryIds, string[] regionIds, int width, int height)
    {
        HashSet<string> playableRegions = new HashSet<string>(RegionConfigs.Select(r => r.Id));
        int playablePixels = 0;
        int territoryPixels = 0;

        for (int i = 0; i < regionIds.Length; i++)
        {
            bool playable = playableRegions.Contains(regionIds[i]);
            if (playable)
            {
                playablePixels++;
                if (territoryIds[i] == null)
                {
                    throw new InvalidOperationException("Playable region pixel was not assigned to a territory at " + (i % width).ToString(CultureInfo.InvariantCulture) + "," + (i / width).ToString(CultureInfo.InvariantCulture) + ".");
                }
            }

            if (territoryIds[i] != null)
            {
                territoryPixels++;
                if (!playable)
                {
                    throw new InvalidOperationException("Background pixel was assigned to a territory at " + (i % width).ToString(CultureInfo.InvariantCulture) + "," + (i / width).ToString(CultureInfo.InvariantCulture) + ".");
                }
            }
        }

        if (territoryPixels != playablePixels)
        {
            throw new InvalidOperationException("Territory pixel coverage does not match playable region pixels.");
        }
    }

    static void ValidateRegions(List<RegionShape> regions, int width, int height)
    {
        Dictionary<string, int> expectedCounts = new Dictionary<string, int>
        {
            { "eriador", 1 },
            { "rhovanion", 1 },
            { "rhun", 1 },
            { "rohan", 1 },
            { "mordor", 1 },
            { "gondor", 1 },
            { "background", 3 }
        };

        foreach (var expected in expectedCounts)
        {
            RegionShape shape = regions.FirstOrDefault(r => r.Id == expected.Key);
            if (shape == null)
            {
                throw new InvalidOperationException("Missing region shape: " + expected.Key + ".");
            }

            int actual = shape.Polygons.Count;
            if (actual != expected.Value)
            {
                throw new InvalidOperationException("Expected " + expected.Value.ToString(CultureInfo.InvariantCulture) + " polygon(s) for " + expected.Key + " but found " + actual.ToString(CultureInfo.InvariantCulture) + ".");
            }
        }

        int totalPixels = regions.Sum(r => r.PixelArea);
        int expectedPixels = width * height;
        if (totalPixels != expectedPixels)
        {
            throw new InvalidOperationException("Region pixel coverage does not match image area. Expected " + expectedPixels.ToString(CultureInfo.InvariantCulture) + " but found " + totalPixels.ToString(CultureInfo.InvariantCulture) + ".");
        }

        foreach (RegionShape shape in regions)
        {
            foreach (RegionPolygon polygon in shape.Polygons)
            {
                if (polygon.Ring.Count < 3)
                {
                    throw new InvalidOperationException("Region polygon has fewer than three points: " + polygon.Id);
                }
            }
        }
    }

    static void ValidateExtractedShapes(
        List<TerritoryShape> shapes,
        Dictionary<string, TerritoryKeyEntry> keyEntries,
        string[] territoryIds,
        string[] regionIds,
        int width,
        int height)
    {
        if (shapes.Count != 42)
        {
            throw new InvalidOperationException("Expected 42 territory shapes but found " + shapes.Count.ToString(CultureInfo.InvariantCulture) + ".");
        }

        foreach (RegionConfig region in RegionConfigs)
        {
            int actual = shapes.Count(s => s.RegionId == region.Id);
            if (actual != region.TerritoryIds.Length)
            {
                throw new InvalidOperationException("Expected " + region.TerritoryIds.Length.ToString(CultureInfo.InvariantCulture) + " shapes for " + region.Name + " but found " + actual.ToString(CultureInfo.InvariantCulture) + ".");
            }
        }

        foreach (TerritoryShape shape in shapes)
        {
            TerritoryKeyEntry entry = keyEntries[shape.Id];
            if (shape.Name != entry.Name || shape.RegionId != entry.RegionId)
            {
                throw new InvalidOperationException("Shape metadata differs from key for " + shape.Id + ".");
            }

            if (shape.PixelArea <= 0)
            {
                throw new InvalidOperationException("Shape has no area: " + shape.Id);
            }

            if (shape.Polygons.Count != 1)
            {
                throw new InvalidOperationException("Territory should be one connected polygon but has " + shape.Polygons.Count.ToString(CultureInfo.InvariantCulture) + ": " + shape.Id);
            }

            foreach (TerritoryPolygon polygon in shape.Polygons)
            {
                if (polygon.Ring.Count < 3)
                {
                    throw new InvalidOperationException("Polygon has fewer than three points: " + polygon.Id);
                }
            }
        }

        int shapePixels = shapes.Sum(s => s.PixelArea);
        int assignedPixels = territoryIds.Count(id => id != null);
        if (shapePixels != assignedPixels)
        {
            throw new InvalidOperationException("Shape pixel total does not match assigned territory pixels.");
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
            default: return 6;
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

        return 1000;
    }

    static void WriteRegionsJson(
        string outputJson,
        string inputImage,
        int width,
        int height,
        int minRed,
        int redDominance,
        int barrierDilateRadius,
        int minComponentArea,
        double simplifyTolerance,
        List<RegionShape> regions)
    {
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("{");
        builder.AppendLine("  \"schema\": \"ardature.map.regions.v1\",");
        builder.AppendLine("  \"description\": \"Mathematical region polygons extracted from maps/source/territory-boundaries.jpeg. Coordinates are in source image pixels. Red lines define region boundaries; page edges close polygons where red lines reach the edge.\",");
        builder.AppendLine("  \"sourceImage\": " + JsonString(RepoPath(inputImage)) + ",");
        builder.AppendLine("  \"coordinateSystem\": {");
        builder.AppendLine("    \"origin\": \"top-left\",");
        builder.AppendLine("    \"unit\": \"source-image-pixel\",");
        builder.AppendLine("    \"width\": " + width.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"height\": " + height.ToString(CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"extraction\": {");
        builder.AppendLine("    \"method\": \"red-mask segmentation, red barrier dilation, flood-fill red-bounded components, semantic seed assignment, nearest-component barrier fill, connected-component polygon tracing, simplification\",");
        builder.AppendLine("    \"minRed\": " + minRed.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"redDominance\": " + redDominance.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"barrierDilateRadius\": " + barrierDilateRadius.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"minComponentArea\": " + minComponentArea.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"simplifyTolerancePixels\": " + simplifyTolerance.ToString("0.##", CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"semanticSeeds\": [");
        for (int i = 0; i < RegionSeeds.Length; i++)
        {
            RegionSeed seed = RegionSeeds[i];
            builder.Append("    { \"id\": " + JsonString(seed.Id) + ", \"name\": " + JsonString(seed.Name) + ", \"point\": [" + seed.X.ToString(CultureInfo.InvariantCulture) + "," + seed.Y.ToString(CultureInfo.InvariantCulture) + "] }");
            builder.AppendLine(i == RegionSeeds.Length - 1 ? "" : ",");
        }
        builder.AppendLine("  ],");
        builder.AppendLine("  \"validation\": {");
        builder.AppendLine("    \"regionPolygonCounts\": {");
        for (int i = 0; i < regions.Count; i++)
        {
            RegionShape region = regions[i];
            builder.Append("      " + JsonString(region.Id) + ": " + region.Polygons.Count.ToString(CultureInfo.InvariantCulture));
            builder.AppendLine(i == regions.Count - 1 ? "" : ",");
        }
        builder.AppendLine("    },");
        builder.AppendLine("    \"totalPixelArea\": " + regions.Sum(r => r.PixelArea).ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"imagePixelArea\": " + (width * height).ToString(CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"regions\": [");

        for (int r = 0; r < regions.Count; r++)
        {
            RegionShape region = regions[r];
            builder.AppendLine("    {");
            builder.AppendLine("      \"id\": " + JsonString(region.Id) + ",");
            builder.AppendLine("      \"name\": " + JsonString(region.Name) + ",");
            builder.AppendLine("      \"polygons\": [");

            for (int p = 0; p < region.Polygons.Count; p++)
            {
                RegionPolygon polygon = region.Polygons[p];
                builder.AppendLine("        {");
                builder.AppendLine("          \"id\": " + JsonString(polygon.Id) + ",");
                builder.AppendLine("          \"pointCount\": " + polygon.Ring.Count.ToString(CultureInfo.InvariantCulture) + ",");
                builder.AppendLine("          \"rawPointCount\": " + polygon.RawRing.Count.ToString(CultureInfo.InvariantCulture) + ",");
                builder.AppendLine("          \"pixelArea\": " + polygon.PixelArea.ToString(CultureInfo.InvariantCulture) + ",");
                builder.AppendLine("          \"polygonArea\": " + polygon.PolygonArea.ToString("0.##", CultureInfo.InvariantCulture) + ",");
                builder.AppendLine("          \"bounds\": " + BoundsJson(polygon.Bounds) + ",");
                builder.AppendLine("          \"centroid\": [" + polygon.Centroid.X.ToString("0.##", CultureInfo.InvariantCulture) + "," + polygon.Centroid.Y.ToString("0.##", CultureInfo.InvariantCulture) + "],");
                builder.AppendLine("          \"ring\": " + RegionPointsJson(polygon.Ring));
                builder.AppendLine("        }" + (p == region.Polygons.Count - 1 ? "" : ","));
            }

            builder.AppendLine("      ]");
            builder.Append("    }");
            builder.AppendLine(r == regions.Count - 1 ? "" : ",");
        }

        builder.AppendLine("  ]");
        builder.AppendLine("}");

        File.WriteAllText(outputJson, builder.ToString(), new UTF8Encoding(false));
    }

    static void WriteTerritoriesJson(
        string outputJson,
        string inputImage,
        string territoryKey,
        int width,
        int height,
        int minRed,
        int redDominance,
        int minBlue,
        int blueDominance,
        int regionBarrierDilateRadius,
        int territoryBarrierDilateRadius,
        int minComponentArea,
        int minHoleArea,
        double simplifyTolerance,
        List<TerritoryShape> shapes)
    {
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("{");
        builder.AppendLine("  \"schema\": \"ardature.map.territories.v1\",");
        builder.AppendLine("  \"description\": \"Mathematical territory polygons extracted from maps/source/territory-boundaries.jpeg. Coordinates are in source image pixels. Red lines define region boundaries; blue lines define territory boundaries inside each region.\",");
        builder.AppendLine("  \"sourceImages\": {");
        builder.AppendLine("    \"boundaryDrawing\": " + JsonString(RepoPath(inputImage)) + ",");
        builder.AppendLine("    \"territoryKey\": " + JsonString(RepoPath(territoryKey)));
        builder.AppendLine("  },");
        builder.AppendLine("  \"coordinateSystem\": {");
        builder.AppendLine("    \"origin\": \"top-left\",");
        builder.AppendLine("    \"unit\": \"source-image-pixel\",");
        builder.AppendLine("    \"width\": " + width.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"height\": " + height.ToString(CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"extraction\": {");
        builder.AppendLine("    \"method\": \"red-mask region segmentation, red/blue territory barrier segmentation, barrier dilation, flood-fill components, semantic seed assignment, nearest-component barrier fill, connected-component polygon tracing, hole tracing, simplification\",");
        builder.AppendLine("    \"minRed\": " + minRed.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"redDominance\": " + redDominance.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"minBlue\": " + minBlue.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"blueDominance\": " + blueDominance.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"regionBarrierDilateRadius\": " + regionBarrierDilateRadius.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"territoryBarrierDilateRadius\": " + territoryBarrierDilateRadius.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"minComponentArea\": " + minComponentArea.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"minHoleArea\": " + minHoleArea.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"simplifyTolerancePixels\": " + simplifyTolerance.ToString("0.##", CultureInfo.InvariantCulture));
        builder.AppendLine("  },");
        builder.AppendLine("  \"semanticSeeds\": [");
        for (int i = 0; i < TerritorySeeds.Length; i++)
        {
            TerritorySeed seed = TerritorySeeds[i];
            builder.Append("    { \"id\": " + JsonString(seed.Id) + ", \"name\": " + JsonString(seed.Name) + ", \"regionId\": " + JsonString(seed.RegionId) + ", \"point\": [" + seed.X.ToString(CultureInfo.InvariantCulture) + "," + seed.Y.ToString(CultureInfo.InvariantCulture) + "] }");
            builder.AppendLine(i == TerritorySeeds.Length - 1 ? "" : ",");
        }
        builder.AppendLine("  ],");
        builder.AppendLine("  \"validation\": {");
        builder.AppendLine("    \"territoryCount\": " + shapes.Count.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"playablePixelArea\": " + shapes.Sum(s => s.PixelArea).ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("    \"territoryCountsByRegion\": {");
        for (int i = 0; i < RegionConfigs.Length; i++)
        {
            RegionConfig region = RegionConfigs[i];
            builder.Append("      " + JsonString(region.Id) + ": " + shapes.Count(s => s.RegionId == region.Id).ToString(CultureInfo.InvariantCulture));
            builder.AppendLine(i == RegionConfigs.Length - 1 ? "" : ",");
        }
        builder.AppendLine("    },");
        builder.AppendLine("    \"pixelAreasByRegion\": {");
        for (int i = 0; i < RegionConfigs.Length; i++)
        {
            RegionConfig region = RegionConfigs[i];
            builder.Append("      " + JsonString(region.Id) + ": " + shapes.Where(s => s.RegionId == region.Id).Sum(s => s.PixelArea).ToString(CultureInfo.InvariantCulture));
            builder.AppendLine(i == RegionConfigs.Length - 1 ? "" : ",");
        }
        builder.AppendLine("    }");
        builder.AppendLine("  },");
        builder.AppendLine("  \"regions\": [");

        for (int r = 0; r < RegionConfigs.Length; r++)
        {
            RegionConfig region = RegionConfigs[r];
            List<TerritoryShape> regionShapes = shapes.Where(s => s.RegionId == region.Id).OrderBy(s => TerritorySortKey(s.Id)).ToList();
            builder.AppendLine("    {");
            builder.AppendLine("      \"id\": " + JsonString(region.Id) + ",");
            builder.AppendLine("      \"name\": " + JsonString(region.Name) + ",");
            builder.AppendLine("      \"territories\": [");

            for (int i = 0; i < regionShapes.Count; i++)
            {
                WriteTerritoryJson(builder, regionShapes[i], i == regionShapes.Count - 1);
            }

            builder.AppendLine("      ]");
            builder.Append("    }");
            builder.AppendLine(r == RegionConfigs.Length - 1 ? "" : ",");
        }

        builder.AppendLine("  ]");
        builder.AppendLine("}");

        File.WriteAllText(outputJson, builder.ToString(), new UTF8Encoding(false));
    }

    static void WriteTerritoryJson(StringBuilder builder, TerritoryShape shape, bool last)
    {
        builder.AppendLine("        {");
        builder.AppendLine("          \"id\": " + JsonString(shape.Id) + ",");
        builder.AppendLine("          \"name\": " + JsonString(shape.Name) + ",");
        builder.AppendLine("          \"regionId\": " + JsonString(shape.RegionId) + ",");
        builder.AppendLine("          \"landBorders\": " + StringArrayJson(shape.LandBorders) + ",");
        builder.AppendLine("          \"shipBorders\": " + StringArrayJson(shape.ShipBorders) + ",");
        builder.AppendLine("          \"pixelArea\": " + shape.PixelArea.ToString(CultureInfo.InvariantCulture) + ",");
        builder.AppendLine("          \"bounds\": " + BoundsJson(shape.Bounds) + ",");
        builder.AppendLine("          \"centroid\": [" + shape.Centroid.X.ToString("0.##", CultureInfo.InvariantCulture) + "," + shape.Centroid.Y.ToString("0.##", CultureInfo.InvariantCulture) + "],");
        builder.AppendLine("          \"polygons\": [");

        for (int i = 0; i < shape.Polygons.Count; i++)
        {
            TerritoryPolygon polygon = shape.Polygons[i];
            builder.AppendLine("            {");
            builder.AppendLine("              \"id\": " + JsonString(polygon.Id) + ",");
            builder.AppendLine("              \"pointCount\": " + polygon.Ring.Count.ToString(CultureInfo.InvariantCulture) + ",");
            builder.AppendLine("              \"rawPointCount\": " + polygon.RawRing.Count.ToString(CultureInfo.InvariantCulture) + ",");
            builder.AppendLine("              \"holeCount\": " + polygon.Holes.Count.ToString(CultureInfo.InvariantCulture) + ",");
            builder.AppendLine("              \"pixelArea\": " + polygon.PixelArea.ToString(CultureInfo.InvariantCulture) + ",");
            builder.AppendLine("              \"polygonArea\": " + polygon.PolygonArea.ToString("0.##", CultureInfo.InvariantCulture) + ",");
            builder.AppendLine("              \"bounds\": " + BoundsJson(polygon.Bounds) + ",");
            builder.AppendLine("              \"centroid\": [" + polygon.Centroid.X.ToString("0.##", CultureInfo.InvariantCulture) + "," + polygon.Centroid.Y.ToString("0.##", CultureInfo.InvariantCulture) + "],");
            builder.AppendLine("              \"ring\": " + PointsJson(polygon.Ring) + ",");
            builder.AppendLine("              \"holes\": " + HolesJson(polygon.Holes));
            builder.AppendLine("            }" + (i == shape.Polygons.Count - 1 ? "" : ","));
        }

        builder.AppendLine("          ]");
        builder.AppendLine("        }" + (last ? "" : ","));
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

    static string StringArrayJson(string[] values)
    {
        if (values.Length == 0)
        {
            return "[]";
        }

        return "[" + String.Join(", ", values.Select(JsonString).ToArray()) + "]";
    }

    static string BoundsJson(Bounds bounds)
    {
        return "{ \"minX\": " + bounds.MinX.ToString("0.##", CultureInfo.InvariantCulture)
            + ", \"minY\": " + bounds.MinY.ToString("0.##", CultureInfo.InvariantCulture)
            + ", \"maxX\": " + bounds.MaxX.ToString("0.##", CultureInfo.InvariantCulture)
            + ", \"maxY\": " + bounds.MaxY.ToString("0.##", CultureInfo.InvariantCulture)
            + " }";
    }

    static string PointsJson(List<PointD> points)
    {
        StringBuilder builder = new StringBuilder();
        builder.Append("[");

        for (int i = 0; i < points.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            if (i % 4 == 0)
            {
                builder.AppendLine();
                builder.Append("                ");
            }
            else
            {
                builder.Append(" ");
            }

            builder.Append("[");
            builder.Append(points[i].X.ToString("0.##", CultureInfo.InvariantCulture));
            builder.Append(",");
            builder.Append(points[i].Y.ToString("0.##", CultureInfo.InvariantCulture));
            builder.Append("]");
        }

        builder.AppendLine();
        builder.Append("              ]");
        return builder.ToString();
    }

    static string HolesJson(List<List<PointD>> holes)
    {
        if (holes.Count == 0)
        {
            return "[]";
        }

        StringBuilder builder = new StringBuilder();
        builder.AppendLine("[");
        for (int i = 0; i < holes.Count; i++)
        {
            builder.Append("                " + PointsJson(holes[i]).Trim());
            builder.AppendLine(i == holes.Count - 1 ? "" : ",");
        }
        builder.Append("              ]");
        return builder.ToString();
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

    static string RegionPointsJson(List<PointD> points)
    {
        StringBuilder builder = new StringBuilder();
        builder.Append("[");

        for (int i = 0; i < points.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            if (i % 4 == 0)
            {
                builder.AppendLine();
                builder.Append("            ");
            }
            else
            {
                builder.Append(" ");
            }

            builder.Append("[");
            builder.Append(points[i].X.ToString("0.##", CultureInfo.InvariantCulture));
            builder.Append(",");
            builder.Append(points[i].Y.ToString("0.##", CultureInfo.InvariantCulture));
            builder.Append("]");
        }

        builder.AppendLine();
        builder.Append("          ]");
        return builder.ToString();
    }

    static void WriteTerritoriesSvg(string outputSvg, string previewBaseImage, int width, int height, List<TerritoryShape> shapes)
    {
        string href = RelativePath(Path.GetDirectoryName(outputSvg), previewBaseImage).Replace('\\', '/');
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        builder.AppendLine("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width.ToString(CultureInfo.InvariantCulture) + "\" height=\"" + height.ToString(CultureInfo.InvariantCulture) + "\" viewBox=\"0 0 " + width.ToString(CultureInfo.InvariantCulture) + " " + height.ToString(CultureInfo.InvariantCulture) + "\">");
        builder.AppendLine("  <rect width=\"100%\" height=\"100%\" fill=\"#f8f6ec\"/>");
        builder.AppendLine("  <image href=\"" + href + "\" x=\"0\" y=\"0\" width=\"" + width.ToString(CultureInfo.InvariantCulture) + "\" height=\"" + height.ToString(CultureInfo.InvariantCulture) + "\" opacity=\"0.36\"/>");

        foreach (TerritoryShape shape in shapes)
        {
            string color = ColorForTerritory(shape);
            foreach (TerritoryPolygon polygon in shape.Polygons)
            {
                builder.AppendLine("  <path d=\"" + SvgPath(polygon) + "\" fill=\"" + color + "\" fill-opacity=\"0.46\" fill-rule=\"evenodd\" stroke=\"#1f2933\" stroke-width=\"0.9\" vector-effect=\"non-scaling-stroke\"/>");
            }
        }

        builder.AppendLine("</svg>");
        File.WriteAllText(outputSvg, builder.ToString(), new UTF8Encoding(false));
    }

    static string SvgPath(TerritoryPolygon polygon)
    {
        StringBuilder path = new StringBuilder();
        AppendSvgRing(path, polygon.Ring);
        foreach (List<PointD> hole in polygon.Holes)
        {
            path.Append(" ");
            AppendSvgRing(path, hole);
        }
        return path.ToString();
    }

    static void AppendSvgRing(StringBuilder path, List<PointD> ring)
    {
        for (int i = 0; i < ring.Count; i++)
        {
            PointD point = ring[i];
            path.Append(i == 0 ? "M " : " L ");
            path.Append(point.X.ToString("0.##", CultureInfo.InvariantCulture));
            path.Append(" ");
            path.Append(point.Y.ToString("0.##", CultureInfo.InvariantCulture));
        }
        path.Append(" Z");
    }

    static Color ParseColor(string value)
    {
        return ColorTranslator.FromHtml(value);
    }

    static string ColorForTerritory(TerritoryShape shape)
    {
        RegionConfig region = RegionConfigs.First(config => config.Id == shape.RegionId);
        Color baseColor = ParseColor(region.Color);
        int order = TerritorySortKey(shape.Id);
        double factor = 0.86 + ((order % 5) * 0.07);
        int red = ClampColor(baseColor.R * factor);
        int green = ClampColor(baseColor.G * factor);
        int blue = ClampColor(baseColor.B * factor);
        return ColorTranslator.ToHtml(Color.FromArgb(red, green, blue));
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

    static string EscapeXml(string value)
    {
        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;");
    }
}
'@

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Drawing.dll"

[MapExtractor]::Extract(
  $inputPath,
  $territoryKeyPath,
  $previewBasePath,
  $regionsJsonPath,
  $territoriesJsonPath,
  $territoriesSvgPath,
  $MinRed,
  $RedDominance,
  $MinBlue,
  $BlueDominance,
  $RegionBarrierDilateRadius,
  $TerritoryBarrierDilateRadius,
  $MinComponentArea,
  $MinHoleArea,
  $SimplifyTolerance)
