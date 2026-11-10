# Bemelegítő és munkasorozatok, súlyajánlás

## Használat – összesen négy sor

A tervben **összesen 4 sorozat** az alapérték. **Az első mindig bemelegítő, a többi munkasorozat.** Egyetlen Sorozatok mezőt állítasz, egyetlen táblázatot kapsz; külön bemelegítő sort nem kell hozzáadni. A teljes sorozatszám 1–20, az ismétléscél 1–100 között módosítható. A cél alapértéke 10.

A régi négy sor is négy marad. Például a korábbi **80 × 10, majd 140 × 10 háromszor**: a 80-as az első, bemelegítő sor; a három 140-es a munka. A mai mezők az eredeti sorrenddel és értékekkel töltődnek ki, nem kerül eléjük ötödik sor.

**Az előző befejezett edzés eredménye után**, már az új edzés megnyitásakor megjelenhet: „Múltkor mindhárom munkasorozatban megvolt a 10 ismétlés. Emelj, ha úgy érzed!” Nem kell előbb elmentened a mai edzést. A jelzés a korábbi, ténylegesen mentett eredményt értékeli; a mai előtöltés nem bizonyít új teljesítményt.

- A bemelegítés súlya és ismétlése kimarad az ajánlásból.
- Az előírt munkasorozatoknak meg kell lenniük, teljesített állapotban, azonos súllyal.
- Ha mindegyik eléri a célt, emelés megfontolását javasolja. Konkrét kilogrammot vagy növelési mértéket nem ad.
- Hiányzó célismétlésnél a súly megtartását és az ismétlések növelését javasolja; eltérő munkasúlyoknál nincs emelési javaslat.
- Az ajánlás figyelmen kívül hagyható és az X-szel elrejthető. Nem módosít súlyt, tervet vagy Firebase-adatot.

Az Edzés mentése a mai megmaradt sorozatokat véglegesíti; a ki nem végzetteket előtte töröld. A naptári kártyára nem kerül külön ajánlásdoboz: a jelzés az új edzésnél, a korábbi eredmény mellett jelenik meg.

## A meglévő architektúra és a változás

| Terület | Meglévő működés és kiegészítés |
| --- | --- |
| React | Az `App` összefoglalót, terveket, statisztikát és naptárt jelenít meg. A `PlanEditor` és `SessionEditor` kapta a típusokat; az előzmény után a `WeightRecommendation` tisztán helyi számítást jelenít meg. |
| Authentication | A Firebase email/jelszó belépés, a szerveres jogosultságpróba és a kijelentkezés változatlan. Az engedélylista továbbra is két vagy három jóváhagyott UID-t tartalmazhat; a három fiók adatai elkülönülnek. |
| Lekérdezések | A `useJournal` kizárólag a saját UID útvonalait olvassa. Induláskor 100 gyakorlatbejegyzés és a hozzájuk tartozó sorozatok töltődnek be, a régebbiek lapozva. A már olvasott előzmények a munkamenet memóriájában maradnak. |
| Mentés | A `writeJournalBatch` továbbra is egy atomi REST-kérésben ment, szerveres szabályellenőrzéssel és sikeres visszaigazolás után. Csak a változott sorozatok íródnak újra; a változatlan mentés 0 írás. |
| Firestore | Nincs új kollekció vagy tömeges adatátalakítás. A kiegészítések a meglévő tervben, gyakorlatbejegyzésben és sorozatdokumentumokban tárolódnak. |
| PWA | Vite, HashRouter, GitHub Pages, reszponzív megjelenés és a meglévő ikonok maradnak. A service worker csak a nyilvános alkalmazásfájlokat tárolja, személyes adatot nem. |

### Additív adatformátum

- `users/{uid}/plans/{planId}`: az `exercises` JSON-szöveg változatlanul teljes sorozatszámot tárol a `sets` mezőben; a `reps` az ismétléscél. Nem szükséges külön bemelegítőszámot menteni, mert mindig az első sor az. A JSON verziószáma 1 marad; a korábbi fejlesztési formátum külön bemelegítőszámát is be tudjuk olvasni, az összes sor megőrzésével.
- `users/{uid}/workouts/{workoutId}`: az új edzések a `plannedWorkSets` és `targetReps` pillanatképet együtt kapják meg. Ezért egy későbbi tervmódosítás nem értékeli át a régi edzést. A két mező régi bejegyzéseknél hiányozhat.
- `users/{uid}/workoutSets/{workoutId}_{index}`: opcionális `type`, amely kizárólag `warmup` vagy `work`. A felület a sorpozícióból értelmezi a típust: az első bemelegítő, a többi munka, a régi típus nélküli adatoknál is. A tárolt súlyokat és ismétléseket nem írjuk át háttérben.

A szabályok továbbra is tiltják a másik felhasználó adatait, az illetéktelen fiókokat, az engedélylista kliensoldali olvasását vagy módosítását és az ismeretlen mezőket. A típus, az ismétléscél és a tervezett munkasorozatszám külön tartományellenőrzést kap. Egy már típusos sorozat típusmezőjét, illetve egy célértékeket tartalmazó edzés célmezőit régi kliens nem törölheti le csendben.

## Régi adatok védelme

- A korábbi szöveges és JSON-tervek továbbra is olvashatók és szerkeszthetők. A teljes korábbi sorozatszám és minden érték megmarad: négy sorból nem lesz öt. Az elsőt bemelegítőnek tekintjük.
- A régi számmezős edzésnaplók és a típus nélküli sorozatok változatlanul megjelennek. Nem fut háttérmigráció, törlés vagy tömeges újraírás.
- A régi, típus nélküli előzményből is megjelenhet a jelzés: az első sor kimarad, a munkasorozatokat az aktuális terv céljával értékeljük. A mentett előzmény saját célértékeit, ha voltak, megőrizzük. Régi rekordot emiatt nem írunk át.
- A terv módosítása nem módosítja a már mentett edzések sorozatait vagy célértékeit.
- Frissítsd a régi PWA-verziót, mielőtt új, típusos edzést szerkesztesz. A szerver megvédi a típusmezőt az olyan régi kliens teljes dokumentumcseréjétől, amely még nem ismeri ezt a mezőt. A régi formátumú adatok továbbra is írhatók.

## Firebase-fogyasztás és díjmentesség

Az ajánlás a már betöltött adatokon fut: **0 további Firestore-olvasás és 0 írás**. Elrejtése is 0 művelet. Nincs AI-szolgáltatás, fizetős API, előfizetés vagy bankkártyás követelmény. A meglévő Firebase Spark és GitHub Pages megoldás marad.

Egy új, 1 bemelegítő + 3 munkasorozatos gyakorlat továbbra is 1 gyakorlatdokumentumot és 4 sorozatdokumentumot, összesen **5 írást** jelent. Hat ilyen gyakorlat közös mentése **30 írás**. A típus és a cél két meglévő dokumentumfajtát bővít néhány mezővel; nem hoz létre külön ajánlásdokumentumot. A már meglévő, 3 sorozatos tervek nem kapnak automatikusan negyedik sorozatot.

## Élesítés pontos sorrendje – a helyi próba jóváhagyása után

**Először helyben próbáljuk ki. Csak a próba jóváhagyása után kerülhet sor a Firebase-szabályok publikálására és az új frontend élesítésére.** A technikai sorrend szabályok → frontend. A régi szabályok az új típus- és célmezőket elutasítanák. A kibővített szabályok a régi formátumot is elfogadják, így a meglévő alkalmazás addig is működik.

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


Helyi ellenőrzés (2026. november 10.): **61 unit és 35 szabályteszt sikeres**. A teljes, 18 tesztes böngészős ellenőrzés után az új hibajavítás külön regressziótesztje Chromium és WebKit alatt is sikeres (2 további eset); a build és a PWA-ellenőrzés is sikeres. A külön helyi emulátoros próbában a régi, típus nélküli 80/140/140/140 sorozat négy sor marad, és a jelzés az előzmény után jelenik meg. A GitHub Actions az éles publikálás előtt ismét lefuttatja az összes ellenőrzést, a kibővített 20 böngészőteszttel.

## Kimaradó jelzések javítása

Az előzménykeresés állapotát gyakorlatonként kezeljük: az egyik gyakorlat lassú vagy sikertelen keresése nem rejti el a többinél már ellenőrzött ajánlást. Az új edzés ajánlása az aktuális terv sorozatszámához és ismétléscéljához viszonyítja a korábbi teljesítményt; régi célmező nem írja felül az új tervet. A tárolt előzményadatok változatlanok maradnak. Eltérő súly, hiányos sorozat vagy más akadály esetén rövid, semleges indok jelenik meg emelési javaslat helyett.

Külön helyi végigpróbálás: szombati 80/140/140/140 × 10 mentése után a hétfői új edzés már a mezők módosítása nélkül mutatja az emelési jelzést. Az ajánlás továbbra is 0 Firebase-írás. A helyi próba után a felhasználó jóváhagyta a GitHub-feltöltést és az élesítést; az élesítés feltétele továbbra is a fenti szabályok publikálása.
