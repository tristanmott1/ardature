export const generatedMapConnections = {
  "forlond": [
    "grey-havens",
    "harlindon"
  ],
  "grey-havens": [
    "forlond",
    "harlindon",
    "shire",
    "north-downs"
  ],
  "harlindon": [
    "forlond",
    "grey-havens",
    "andrast"
  ],
  "shire": [
    "grey-havens",
    "bree",
    "north-downs",
    "minhiriath"
  ],
  "bree": [
    "shire",
    "north-downs",
    "ettenmoors",
    "rivendell",
    "minhiriath",
    "swanfleet"
  ],
  "north-downs": [
    "grey-havens",
    "shire",
    "bree",
    "ettenmoors"
  ],
  "ettenmoors": [
    "bree",
    "north-downs",
    "rivendell"
  ],
  "rivendell": [
    "bree",
    "ettenmoors",
    "swanfleet",
    "caradhras"
  ],
  "minhiriath": [
    "shire",
    "bree",
    "swanfleet",
    "enedwaith",
    "andrast"
  ],
  "swanfleet": [
    "bree",
    "rivendell",
    "minhiriath",
    "enedwaith",
    "isengard",
    "moria"
  ],
  "enedwaith": [
    "minhiriath",
    "swanfleet",
    "isengard",
    "druwaith-iaur",
    "andrast"
  ],
  "isengard": [
    "swanfleet",
    "enedwaith",
    "westfold",
    "druwaith-iaur"
  ],
  "greylin": [
    "caradhras",
    "woodland-realm"
  ],
  "caradhras": [
    "rivendell",
    "greylin",
    "woodland-realm",
    "gladden-fields",
    "lorien"
  ],
  "woodland-realm": [
    "greylin",
    "caradhras",
    "gladden-fields",
    "erebor",
    "brown-lands"
  ],
  "gladden-fields": [
    "caradhras",
    "woodland-realm",
    "lorien",
    "dol-guldur"
  ],
  "lorien": [
    "caradhras",
    "gladden-fields",
    "dol-guldur",
    "emyn-muil",
    "moria"
  ],
  "dol-guldur": [
    "gladden-fields",
    "lorien",
    "emyn-muil"
  ],
  "emyn-muil": [
    "lorien",
    "dol-guldur",
    "dead-marshes",
    "brown-lands",
    "dagorlad",
    "emnet"
  ],
  "dead-marshes": [
    "emyn-muil",
    "dagorlad",
    "emnet",
    "eastfold",
    "udun",
    "minas-tirith"
  ],
  "moria": [
    "swanfleet",
    "lorien"
  ],
  "erebor": [
    "woodland-realm",
    "iron-hills",
    "brown-lands"
  ],
  "iron-hills": [
    "erebor",
    "sea-of-rhun",
    "dorwinion",
    "brown-lands"
  ],
  "sea-of-rhun": [
    "iron-hills",
    "dorwinion",
    "dagorlad",
    "lithlad"
  ],
  "dorwinion": [
    "iron-hills",
    "sea-of-rhun",
    "brown-lands",
    "dagorlad"
  ],
  "brown-lands": [
    "woodland-realm",
    "emyn-muil",
    "erebor",
    "iron-hills",
    "dorwinion",
    "dagorlad"
  ],
  "dagorlad": [
    "emyn-muil",
    "dead-marshes",
    "sea-of-rhun",
    "dorwinion",
    "brown-lands"
  ],
  "westfold": [
    "isengard",
    "emnet",
    "edoras"
  ],
  "emnet": [
    "emyn-muil",
    "dead-marshes",
    "westfold",
    "edoras",
    "eastfold"
  ],
  "edoras": [
    "westfold",
    "emnet",
    "eastfold"
  ],
  "eastfold": [
    "dead-marshes",
    "emnet",
    "edoras",
    "minas-tirith"
  ],
  "udun": [
    "dead-marshes",
    "minas-morgul"
  ],
  "lithlad": [
    "sea-of-rhun",
    "minas-morgul",
    "nurn"
  ],
  "minas-morgul": [
    "udun",
    "lithlad",
    "nurn",
    "minas-tirith"
  ],
  "nurn": [
    "lithlad",
    "minas-morgul"
  ],
  "druwaith-iaur": [
    "enedwaith",
    "isengard",
    "andrast",
    "anfalas"
  ],
  "andrast": [
    "harlindon",
    "minhiriath",
    "enedwaith",
    "druwaith-iaur",
    "anfalas"
  ],
  "anfalas": [
    "druwaith-iaur",
    "andrast",
    "lamedon"
  ],
  "lamedon": [
    "anfalas",
    "belfalas"
  ],
  "belfalas": [
    "lamedon",
    "minas-tirith",
    "south-gondor"
  ],
  "minas-tirith": [
    "dead-marshes",
    "eastfold",
    "minas-morgul",
    "belfalas",
    "south-gondor"
  ],
  "south-gondor": [
    "belfalas",
    "minas-tirith"
  ]
} as const;
