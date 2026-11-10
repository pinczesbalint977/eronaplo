# Bemelegítő és munkasorozatok, súlyajánlás

## Használat

Új tervben minden új gyakorlat alapértéke **1 bemelegítő + 3 munkasorozat**, **10-es ismétléscéllal**. Az Edzéstervek szerkesztőjében külön állítható a bemelegítők és a munkasorozatok száma, valamint az ismétléscél. Egy gyakorlat összesen legfeljebb 20 sorozatos lehet. A bemelegítők száma 0 is lehet, legalább egy munkasorozat szükséges.

Edzéskor a bemelegítés narancsszínű, a munkasorozatok lime jelölést kapnak. Az előző eredmények típusonként és sorszámonként illeszkednek a mai sorozatokhoz: korábbi munkasorozat súlya nem kerül automatikusan új bemelegítő sorozatba. A mai mezők szabadon módosíthatók; az alkalmazás nem választ súlynövelési mértéket.

Az **Edzés mentése** véglegesíti a megmaradt sorozatokat. A ki nem végzett sorozatokat előtte töröld. Teljesítési jelölőnégyzet továbbra sincs. Az előírt munkasorozatok száma a mentett edzésben megmarad akkor is, ha kevesebbet végeztél: hiányos teljesítésből nem lesz ajánlás.

Az ajánlás a **mentett edzés kártyáján** jelenik meg, nem az előtöltött űrlapon. Feltételei:

- A gyakorlat befejezettként van mentve, és minden előírt munkasorozat ténylegesen megvan, teljesített állapotban.
- A munkasorozatok súlya azonos. Eltérő súlyok esetén nincs automatikus súlynövelési ajánlás.
- Ha minden munkasorozat eléri a célismétlést, súlynövelés megfontolását javasolja. Konkrét kilogrammot vagy növelési mértéket soha nem ajánl.
- Ha ugyanazon a súlyon nem minden sorozat érte el a célt, a súly megtartását és az ismétlések növelését javasolja.
- A bemelegítés kimarad az értékelésből. Az esetleg hozzáadott további munkasorozatoknak is teljesítettnek kell lenniük; eltérő súlyuk szintén kizárja a növelési javaslatot.

Az ajánlás tájékoztató. Az X gombbal elrejthető; ez csak az aktuális nézet memóriáját módosítja. Nem ír Firebase-be, nem változtatja meg az értékeket vagy a tervet. Az összterhelés és az általános sorozatstatisztika továbbra is az összes elvégzett sorozatot számolja, a bemelegítést is.

## A meglévő architektúra és a változás

| Terület | Meglévő működés és kiegészítés |
| --- | --- |
| React | Az `App` összefoglalót, terveket, statisztikát és naptárt jelenít meg. A `PlanEditor` és `SessionEditor` kapta a típusokat; a mentett kártyán a `WeightRecommendation` tisztán helyi számítást jelenít meg. |
| Authentication | A Firebase email/jelszó belépés, a szerveres jogosultságpróba és a kijelentkezés változatlan. Az engedélylista továbbra is két vagy három jóváhagyott UID-t tartalmazhat; a három fiók adatai elkülönülnek. |
| Lekérdezések | A `useJournal` kizárólag a saját UID útvonalait olvassa. Induláskor 100 gyakorlatbejegyzés és a hozzájuk tartozó sorozatok töltődnek be, a régebbiek lapozva. A már olvasott előzmények a munkamenet memóriájában maradnak. |
| Mentés | A `writeJournalBatch` továbbra is egy atomi REST-kérésben ment, szerveres szabályellenőrzéssel és sikeres visszaigazolás után. Csak a változott sorozatok íródnak újra; a változatlan mentés 0 írás. |
| Firestore | Nincs új kollekció vagy tömeges adatátalakítás. A kiegészítések a meglévő tervben, gyakorlatbejegyzésben és sorozatdokumentumokban tárolódnak. |
| PWA | Vite, HashRouter, GitHub Pages, reszponzív megjelenés és a meglévő ikonok maradnak. A service worker csak a nyilvános alkalmazásfájlokat tárolja, személyes adatot nem. |

### Additív adatformátum

- `users/{uid}/plans/{planId}`: a meglévő `exercises` JSON-szövegben a gyakorlat opcionális `warmupSets` mezőt kap. A `sets` továbbra is a munkasorozatok száma, a `reps` az ismétléscél. A JSON verziószáma 1 marad.
- `users/{uid}/workouts/{workoutId}`: az új edzések a `plannedWorkSets` és `targetReps` pillanatképet együtt kapják meg. Ezért egy későbbi tervmódosítás nem értékeli át a régi edzést. A két mező régi bejegyzéseknél hiányozhat.
- `users/{uid}/workoutSets/{workoutId}_{index}`: opcionális `type`, amely kizárólag `warmup` vagy `work`. A hiányzó típus régi munkasorozatot jelent.

A szabályok továbbra is tiltják a másik felhasználó adatait, az illetéktelen fiókokat, az engedélylista kliensoldali olvasását vagy módosítását és az ismeretlen mezőket. A típus, az ismétléscél és a tervezett munkasorozatszám külön tartományellenőrzést kap. Egy már típusos sorozat típusmezőjét, illetve egy célértékeket tartalmazó edzés célmezőit régi kliens nem törölheti le csendben.

## Régi adatok védelme

- A korábbi szöveges és JSON-tervek továbbra is olvashatók és szerkeszthetők. A korábbi sorozatszám és ismétlés megmarad; nem adunk automatikusan új sorozatot hozzájuk. Régi tervnél a kezdeti bemelegítőszám 0, ezt kézzel változtathatod.
- A régi számmezős edzésnaplók és a típus nélküli sorozatok változatlanul megjelennek. Nem fut háttérmigráció, törlés vagy tömeges újraírás.
- Olyan régi edzéshez, amelyben nem szerepelt előírt munkasorozatszám és ismétléscél, nem találunk ki utólag ajánlást. Az eredményei továbbra is láthatók és szerkeszthetők.
- A terv módosítása nem módosítja a már mentett edzések sorozatait vagy célértékeit.
- Frissítsd a régi PWA-verziót, mielőtt új, típusos edzést szerkesztesz. A szerver megvédi a típusmezőt az olyan régi kliens teljes dokumentumcseréjétől, amely még nem ismeri ezt a mezőt. A régi formátumú adatok továbbra is írhatók.

## Firebase-fogyasztás és díjmentesség

Az ajánlás a már betöltött adatokon fut: **0 további Firestore-olvasás és 0 írás**. Elrejtése is 0 művelet. Nincs AI-szolgáltatás, fizetős API, előfizetés vagy bankkártyás követelmény. A meglévő Firebase Spark és GitHub Pages megoldás marad.

Egy új, 1 bemelegítő + 3 munkasorozatos gyakorlat továbbra is 1 gyakorlatdokumentumot és 4 sorozatdokumentumot, összesen **5 írást** jelent. Hat ilyen gyakorlat közös mentése **30 írás**. A típus és a cél két meglévő dokumentumfajtát bővít néhány mezővel; nem hoz létre külön ajánlásdokumentumot. A már meglévő, 3 sorozatos tervek nem kapnak automatikusan negyedik sorozatot.

## Élesítés pontos sorrendje

**Először a szabályokat kell publikálni, utána az új frontendet.** A régi szabályok az új típus- és célmezőket elutasítanák. A kibővített szabályok a régi formátumot is elfogadják, így a meglévő alkalmazás addig is működik.

1. Nyisd meg a fejlesztési ág `firestore.rules` fájlját: https://github.com/pinczesbalint977/eronaplo/blob/feature/warmup-work-sets/firestore.rules
2. Másold ki a **teljes** tartalmát, lehetőleg a GitHub Copy raw file gombjával.
3. Firebase Console → `eronaplo` projekt → Firestore Database → **Rules**.
4. A szerkesztő teljes régi tartalmát cseréld le. A `rules_version` csak egyszer szerepeljen.
5. Kattints a **Publish** gombra, és várd meg a sikeres publikálást. Az `access/allowedUsers` dokumentumot és a három UID-t ne módosítsd.
6. Ezután kerülhet a tesztelt fejlesztés a `main` ágra. A meglévő GitHub Actions lefuttatja az ellenőrzéseket és automatikusan publikál GitHub Pages-re.
7. A zöld publikálás után nyisd meg https://pinczesbalint977.github.io/eronaplo/ címet. A telefonon a felajánlott Frissítés gombbal töltsd be az új PWA-t; a még nem mentett edzést előtte mentsd.
8. Egy új tervben ellenőrizd az 1+3/10 alapértékeket, majd egy mentett edzésnél az ajánlást. Egy régi napló megnyitásával ellenőrizd, hogy a korábbi értékek megmaradtak.

A GitHub Actions nem telepít Firebase-szabályokat. Ha a fejlesztés már `main`-en van, a fenti szabályfájl a `main` ágról is elérhető. A Firebase-projekt adminisztrátori hozzáférése nélkül az éles szabályokat a projekt gazdájának kell publikálnia.

## Automatizált ellenőrzések

- `npm run test:unit`: ajánlási esetek, bemelegítők kizárása, egyéni célok, eltérő súlyok, hiányos teljesítés, régi adatok, típushelyes előtöltés és változásalapú mentés.
- `npm run test:rules`: Firestore-emulátoros jogosultság-, adattípus-, tartomány-, visszafelé kompatibilitási és mezőmegőrzési tesztek.
- `npm run build` és `node scripts/check-pwa-build.mjs`: React/PWA build, ikonok, manifest és elérési utak.
- `npm run test:e2e`: Chromium és WebKit alatt a meglévő folyamatok, valamint az új alapértékek, típusok mentése, előtöltése, változatlan előzmények, ajánlás és elrejtés mobilnézetben.

Helyi eredmény (2026. november 10.): **56 unit, 35 szabály- és 18 böngészőteszt sikeres**, továbbá a build és PWA-ellenőrzés is sikeres. Fizikai iPhone/Android telepítési próba nincs automatizálva; a böngészőmotorokat és a mobilméreteket ellenőriztük.
