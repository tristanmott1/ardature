# Territory Key

This file is the source of truth for the Ardatúrë Middle-earth territory map.

The map has 6 regions and 42 territories:

- Eriador: 12 territories.
- Rhovanion: 9 territories.
- Rhûn: 6 territories.
- Rohan: 4 territories.
- Mordor: 4 territories.
- Gondor: 7 territories.

Normal land and ship rows describe bidirectional gameplay connections. If territory A lists territory B in one of those rows, the extractor emits both A -> B and B -> A. The `One-way Connections` section describes directed gameplay edges that emit only the listed direction.

This file defines the base directed gameplay graph. Runtime game state can temporarily disable base edges. The Rivendell-Caradhras pass is the first dynamic edge modifier: when `caradhrasPassState` is `6-10`, all directed edges between Rivendell and Caradhras are inactive for every gameplay and visibility rule, while the visual physical border remains.

## Connection Types

- Land border: normal bidirectional territory adjacency.
- Ship border: dotted bidirectional sea adjacency. Ship borders count as territory connections for gameplay unless a later rule explicitly changes this.
- Impassable separator: visible geography that blocks adjacency.

Canonical ship borders:

- Forlond - Harlindon.
- Andrast -> Harlindon.
- Andrast -> Minhiriath.
- Andrast -> Enedwaith.

## One-way Connections

| From | To | Type | Notes |
| --- | --- | --- | --- |
| Udûn | Dead Marshes | Land | Mordor pass can move north out of Udûn, but not south from Dead Marshes. |
| Andrast | Enedwaith | Ship | One-way western sea route. |
| Andrast | Minhiriath | Ship | One-way western sea route. |
| Andrast | Harlindon | Ship | One-way western sea route. |
| Edoras | Lamedon | Land | Gameplay-only directed pass. |

Canonical impassable separators:

- Fangorn Forest is not a territory and separates Lórien from Rohan.
- The mountains of Mordor block Minas Tirith from Udûn, Lithlad, and Nurn.
- The mountains of Mordor block Dead Marshes from Mordor territories except Udûn.

## Region: Eriador

Eriador is the largest region. It covers almost everything west of the Misty Mountains.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Forlond | Northwestern coastal territory of Eriador, north of the Gulf of Lune. | Grey Havens | Harlindon | Dotted route across the bay to Harlindon. |
| Grey Havens | Western coastal territory east of the Gulf of Lune. | Forlond, Harlindon, North Downs, Shire | None |  |
| Harlindon | Southwestern coastal territory around the Gulf of Lune, south of Forlond. | Grey Havens | Forlond | Dotted route to Forlond. |
| Shire | Western-central Eriador, south of Grey Havens. | Grey Havens, North Downs, Bree, Minhiriath | None |  |
| Bree | Central Eriador, east of Shire. | Shire, North Downs, Ettenmoors, Rivendell, Swanfleet, Minhiriath | None |  |
| North Downs | Northern Eriador, east of Grey Havens and west of Ettenmoors. | Grey Havens, Shire, Bree, Ettenmoors | None |  |
| Ettenmoors | Northeastern Eriador, east of North Downs and northwest of Rivendell. | North Downs, Rivendell, Bree | None |  |
| Rivendell | Eastern Eriador at the western side of the Misty Mountains. | Ettenmoors, Bree, Swanfleet, Caradhras | None | Cross-region border to Caradhras in Rhovanion. |
| Minhiriath | Southwestern Eriador, south of Shire and Bree. | Shire, Bree, Swanfleet, Enedwaith | None | One-way dotted route from Andrast. |
| Swanfleet | Southeastern Eriador near the western gate of Moria. | Bree, Rivendell, Moria, Isengard, Minhiriath, Enedwaith | None | Cross-region border to Moria in Rhovanion. |
| Enedwaith | South-central Eriador, north of Gondor. | Minhiriath, Swanfleet, Isengard, Drúwaith Iaur | None | One-way dotted route from Andrast. |
| Isengard | Southern Eriador at the gap near the Misty Mountains. | Enedwaith, Swanfleet, Westfold, Drúwaith Iaur | None | Cross-region borders to Rohan and Gondor. |

## Region: Rhovanion

Rhovanion lies east of the Misty Mountains, north of Rohan, and west of Rhûn.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Greylin | Northwestern Rhovanion, north of Caradhras and northwest of Woodland Realm. | Caradhras, Woodland Realm | None |  |
| Caradhras | Western Rhovanion on the east side of the Misty Mountains. | Rivendell, Greylin, Woodland Realm, Gladden Fields, Lórien | None | Cross-region border to Rivendell in Eriador. |
| Woodland Realm | Northeastern Rhovanion forest territory. | Greylin, Caradhras, Gladden Fields, Erebor, Brown Lands | None | Cross-region borders to Erebor and Brown Lands in Rhûn. |
| Gladden Fields | Central-northern Rhovanion between Caradhras, Woodland Realm, Lórien, and Dol Guldur. | Woodland Realm, Caradhras, Lórien, Dol Guldur | None |  |
| Lórien | Southwestern Rhovanion forest territory. | Caradhras, Gladden Fields, Dol Guldur, Moria, Emyn Muil | None | Fangorn Forest blocks any southern border into Rohan. |
| Dol Guldur | Central Rhovanion south of Gladden Fields. | Lórien, Gladden Fields, Emyn Muil | None |  |
| Emyn Muil | Southeastern Rhovanion west of Dagorlad and north of Rohan. | Lórien, Dol Guldur, Emnet, Dead Marshes, Brown Lands, Dagorlad | None | Cross-region borders to Rohan and Rhûn. |
| Dead Marshes | Southern Rhovanion between Rohan, Gondor, Mordor, and Dagorlad. | Emnet, Emyn Muil, Dagorlad, Minas Tirith, Eastfold | None | Cross-region borders to Rohan, Rhûn, Mordor, and Gondor. One-way land edge from Udûn. |
| Moria | Western Rhovanion in the Misty Mountains. | Swanfleet, Lórien | None | Cross-region border to Swanfleet in Eriador. |

## Region: Rhûn

Rhûn lies east of Rhovanion and north of Mordor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Erebor | Northwestern Rhûn, east of Woodland Realm. | Woodland Realm, Iron Hills, Brown Lands | None |  |
| Iron Hills | Northern Rhûn east of Erebor. | Erebor, Brown Lands, Dorwinion, Sea of Rhûn | None |  |
| Sea of Rhûn | Eastern Rhûn around the inland sea. | Iron Hills, Dorwinion, Dagorlad, Lithlad | None | Cross-region border to Lithlad in Mordor. |
| Dorwinion | Central Rhûn west of the Sea of Rhûn. | Iron Hills, Sea of Rhûn, Dagorlad, Brown Lands | None |  |
| Brown Lands | Western Rhûn east of Emyn Muil. | Erebor, Iron Hills, Dorwinion, Dagorlad, Emyn Muil, Woodland Realm | None | Cross-region borders to Emyn Muil and Woodland Realm in Rhovanion. |
| Dagorlad | Southwestern Rhûn north of Mordor and east of Dead Marshes. | Brown Lands, Dorwinion, Sea of Rhûn, Dead Marshes, Emyn Muil | None | Cross-region borders to Rhovanion. |

## Region: Mordor

Mordor is the southeastern region, enclosed by mountain barriers except for the listed passes.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Udûn | Northwestern Mordor, directly south of Dead Marshes. | Minas Morgul | None | One-way land edge to Dead Marshes. |
| Lithlad | Northeastern Mordor, south of the Sea of Rhûn. | Sea of Rhûn, Minas Morgul, Nurn | None | Cross-region border to Sea of Rhûn in Rhûn. |
| Minas Morgul | Western Mordor pass through the mountains. | Minas Tirith, Udûn, Lithlad, Nurn | None | The narrow pass connecting Mordor to Minas Tirith. |
| Nurn | Southern Mordor. | Minas Morgul, Lithlad | None | Mountains block Minas Tirith from Nurn. |

## Region: Gondor

Gondor is the southwestern and south-central region, west of Mordor and south of Rohan.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Drúwaith Iaur | Northwestern Gondor, south of Enedwaith and Isengard. | Enedwaith, Isengard, Andrast, Anfalas | None | Cross-region borders to Enedwaith and Isengard in Eriador. |
| Andrast | Southwestern Gondor peninsula. | Drúwaith Iaur, Anfalas | None | Sends all western dotted sea routes as one-way ship edges. |
| Anfalas | Western Gondor coast east of Andrast. | Andrast, Drúwaith Iaur, Lamedon | None |  |
| Lamedon | Central Gondor east of Anfalas. | Anfalas, Belfalas | None |  |
| Belfalas | Southeastern-central Gondor coast west of Minas Tirith. | Lamedon, Minas Tirith, South Gondor | None |  |
| Minas Tirith | Eastern Gondor, west of Minas Morgul and south of Eastfold/Dead Marshes. | Belfalas, South Gondor, Minas Morgul, Dead Marshes, Eastfold | None | Mordor access is only through Minas Morgul. |
| South Gondor | Southern Gondor, south of Belfalas and Minas Tirith. | Belfalas, Minas Tirith | None |  |

## Region: Rohan

Rohan sits near the center of the map, south of Rhovanion and north of Gondor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Westfold | Northwestern Rohan, east of Isengard. | Isengard, Edoras, Emnet | None | Cross-region border to Isengard in Eriador. |
| Emnet | Northern and eastern Rohan, east of Westfold and north of Eastfold. | Westfold, Edoras, Eastfold, Emyn Muil, Dead Marshes | None | Cross-region borders to Rhovanion. |
| Edoras | Southwestern Rohan, south of Westfold and west of Eastfold. | Westfold, Emnet, Eastfold | None | One-way land edge to Lamedon. |
| Eastfold | Southeastern Rohan, east of Edoras and south of Emnet. | Edoras, Emnet, Dead Marshes, Minas Tirith | None | Cross-region borders to Rhovanion and Gondor. |

## Alphabetical Territory Index

| Territory | Region | Land borders | Ship borders |
| --- | --- | --- | --- |
| Andrast | Gondor | Drúwaith Iaur, Anfalas | None |
| Anfalas | Gondor | Andrast, Drúwaith Iaur, Lamedon | None |
| Belfalas | Gondor | Lamedon, Minas Tirith, South Gondor | None |
| Bree | Eriador | Shire, North Downs, Ettenmoors, Rivendell, Swanfleet, Minhiriath | None |
| Brown Lands | Rhûn | Erebor, Iron Hills, Dorwinion, Dagorlad, Emyn Muil, Woodland Realm | None |
| Caradhras | Rhovanion | Rivendell, Greylin, Woodland Realm, Gladden Fields, Lórien | None |
| Dagorlad | Rhûn | Brown Lands, Dorwinion, Sea of Rhûn, Dead Marshes, Emyn Muil | None |
| Dead Marshes | Rhovanion | Emnet, Emyn Muil, Dagorlad, Minas Tirith, Eastfold | None |
| Dol Guldur | Rhovanion | Lórien, Gladden Fields, Emyn Muil | None |
| Dorwinion | Rhûn | Iron Hills, Sea of Rhûn, Dagorlad, Brown Lands | None |
| Drúwaith Iaur | Gondor | Enedwaith, Isengard, Andrast, Anfalas | None |
| Eastfold | Rohan | Edoras, Emnet, Dead Marshes, Minas Tirith | None |
| Edoras | Rohan | Westfold, Emnet, Eastfold | None |
| Emnet | Rohan | Westfold, Edoras, Eastfold, Emyn Muil, Dead Marshes | None |
| Emyn Muil | Rhovanion | Lórien, Dol Guldur, Emnet, Dead Marshes, Brown Lands, Dagorlad | None |
| Enedwaith | Eriador | Minhiriath, Swanfleet, Isengard, Drúwaith Iaur | None |
| Erebor | Rhûn | Woodland Realm, Iron Hills, Brown Lands | None |
| Ettenmoors | Eriador | North Downs, Rivendell, Bree | None |
| Forlond | Eriador | Grey Havens | Harlindon |
| Gladden Fields | Rhovanion | Woodland Realm, Caradhras, Lórien, Dol Guldur | None |
| Grey Havens | Eriador | Forlond, Harlindon, North Downs, Shire | None |
| Greylin | Rhovanion | Caradhras, Woodland Realm | None |
| Harlindon | Eriador | Grey Havens | Forlond |
| Iron Hills | Rhûn | Erebor, Brown Lands, Dorwinion, Sea of Rhûn | None |
| Isengard | Eriador | Enedwaith, Swanfleet, Westfold, Drúwaith Iaur | None |
| Lamedon | Gondor | Anfalas, Belfalas | None |
| Lithlad | Mordor | Sea of Rhûn, Minas Morgul, Nurn | None |
| Lórien | Rhovanion | Caradhras, Gladden Fields, Dol Guldur, Moria, Emyn Muil | None |
| Minas Morgul | Mordor | Minas Tirith, Udûn, Lithlad, Nurn | None |
| Minas Tirith | Gondor | Belfalas, South Gondor, Minas Morgul, Dead Marshes, Eastfold | None |
| Minhiriath | Eriador | Shire, Bree, Swanfleet, Enedwaith | None |
| Moria | Rhovanion | Swanfleet, Lórien | None |
| North Downs | Eriador | Grey Havens, Shire, Bree, Ettenmoors | None |
| Nurn | Mordor | Minas Morgul, Lithlad | None |
| Rivendell | Eriador | Ettenmoors, Bree, Swanfleet, Caradhras | None |
| Sea of Rhûn | Rhûn | Iron Hills, Dorwinion, Dagorlad, Lithlad | None |
| Shire | Eriador | Grey Havens, North Downs, Bree, Minhiriath | None |
| South Gondor | Gondor | Belfalas, Minas Tirith | None |
| Swanfleet | Eriador | Bree, Rivendell, Moria, Isengard, Minhiriath, Enedwaith | None |
| Udûn | Mordor | Minas Morgul | None |
| Westfold | Rohan | Isengard, Edoras, Emnet | None |
| Woodland Realm | Rhovanion | Greylin, Caradhras, Gladden Fields, Erebor, Brown Lands | None |
