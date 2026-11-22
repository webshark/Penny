/**
 * Common Israeli merchants and payees, and the category each one almost always is, so new transactions get a
 * category without AI and without a network. Only unambiguous names are listed: a chain that sells several kinds
 * of things (a drugstore, a department store) is left for the user, memory or AI. More specific patterns come
 * first ("רמי לוי תקשורת" before "רמי לוי", "פזגז" before "פז"). Category names are the app's seeded English names.
 * Hebrew has no \b, so Hebrew words are bounded by (^|[^א-ת]) and (?![א-ת]).
 */
const he = (words: string) => new RegExp(`(^|[^א-ת])(?:${words})(?![א-ת])`);
const en = (words: string) => new RegExp(`\\b(?:${words})\\b`, "i");

type Entry = [RegExp, string];

const EXPENSE: Entry[] = [
  // Government and the state.
  [he("ביטוח לאומי|המוסד לביטוח לאומי"), "National Insurance"],
  [he("מס הכנסה|רשות המסים"), "Income Tax"],
  [he("משרד הרישוי|רשות הרישוי|אגרת רישוי"), "Car Test & License"],
  // Telecom before the chains and fuel companies that share names.
  [he("רמי לוי תקשורת|הוט מובייל|פרטנר|סלקום|גולן טלקום|פלאפון|וי קום|we4g|019 מובייל|012 מובייל|אקספון|מרקטפרו"), "Mobile Phone"],
  [en("partner communications|cellcom|pelephone|golan telecom|hot mobile|xphone"), "Mobile Phone"],
  [he("בזק|הוט|יס|סטינג|פרטנר טי וי|סלקום טי וי|בזק בינלאומי|אינטרנט רימון|טריפל סי"), "Internet & TV"],
  [en("bezeq|yes satellite|sting tv|partner tv|cellcom tv"), "Internet & TV"],
  // Utilities.
  [he("חברת החשמל|חשמל לישראל|חח\"י|אלקטרה פאוור|אמישראגז חשמל|סלקום אנרג'י|פזגז חשמל"), "Electricity"],
  [en("israel electric"), "Electricity"],
  [he("סופרגז|פזגז|אמישראגז|דורגז|גז יגל"), "Gas"],
  [he("מי אביבים|מי שבע|מי כרמל|מי רעננה|מי נתניה|מי ציונה|מי רהט|מי הוד השרון|מי הרצליה|מי מודיעין|הגיחון|מי לוד|מי עירון|מי רמת גן|מי גבעתיים|מי בת ים|מי חולון|מי ראשון|מי אשקלון|מי אשדוד|תאגיד המים|תאגיד מים|מניב ראשון|פלגי מוצקין|עין אפק|מי שמש|מעיינות"), "Water"],
  [he("ארנונה|עיריית|עירית|מועצה מקומית|מועצה אזורית"), "Arnona"],
  [he("ועד בית|ועד הבית"), "Building Committee"],
  [he("שכר דירה|שכירות"), "Rent"],
  [he("משכנתא|משכנתה"), "Mortgage"],
  // Fuel and cars.
  [he("פז|פז ילו|סונול|דור אלון|דלק|טן דלק|תחנת דלק"), "Fuel"],
  [en("paz|yellow|sonol|dor alon|delek|ten fuel"), "Fuel"],
  [he("פנגו|סלופארק|אחוזת החוף|חניון|חניה"), "Parking"],
  [en("pango|cellopark"), "Parking"],
  [he("מוסך|צמיגי|פנצ'רייה|שטיפת רכב"), "Car Maintenance"],
  [he("רב קו|רב-קו|רכבת ישראל|אגד|מטרופולין|אפיקים|קווים|סופרבוס|אלקטרה אפיקים|מוביט"), "Public Transport"],
  [en("israel railways|rav kav|egged|moovit"), "Public Transport"],
  [he("גט טקסי|יאנגו|מונית"), "Taxis"],
  [en("gett|yango|uber"), "Taxis"],
  // Food.
  [he("וולט|תן ביס|משלוחה"), "Food Delivery"],
  [en("wolt|10bis|tenbis"), "Food Delivery"],
  [he("ארומה|קפה קפה|גרג|קופיקס|לנדוור|קפה ג'ו|אילנ'ס|נחת קפה"), "Coffee & Cafes"],
  [en("aroma|cofix|landwer|cafe joe|greg cafe"), "Coffee & Cafes"],
  [he("רולדין|ברד וויל|לחם ארז|אנג'ל|מאפיית"), "Bakery"],
  [he("מקדונלדס|בורגר קינג|דומינוס|פיצה האט|ביג אפל|שגב אקספרס|BBB|מוזס|אגדיר|גירף"), "Restaurants"],
  [en("mcdonald'?s|burger king|domino'?s|pizza hut|kfc|bbb"), "Restaurants"],
  [he("שופרסל|רמי לוי|ויקטורי|יוחננוף|אושר עד|מגה בעיר|טיב טעם|יינות ביתן|חצי חינם|קרפור|סופר יודה|מחסני השוק|נתיב החסד|קשת טעמים|זול ובגדול|סיטי מרקט|פרש מרקט|אם פם|AM:PM|סופר דוש|שוק העיר|ברכת השדה"), "Groceries"],
  [en("shufersal|rami levy|victory|yochananof|osher ad|carrefour|am:?pm|tiv taam"), "Groceries"],
  // Health.
  [he("מכבי שירותי בריאות|כללית שירותי בריאות|שירותי בריאות כללית|קופת חולים|מאוחדת|לאומית שירותי בריאות"), "Health Fund"],
  [he("רופא שיניים|מרפאת שיניים"), "Dentist"],
  [he("אופטיקה|משקפיים"), "Optics"],
  // Kids.
  [he("צהרון|גן ילדים|מעון יום|פעוטון"), "Daycare & After-school"],
  // Subscriptions and streaming.
  [en("netflix|spotify|disney\\+?|hbo max|max\\.com|youtube premium|apple tv|amazon prime video|deezer"), "Streaming"],
  [he("נטפליקס|ספוטיפיי"), "Streaming"],
  [en("icloud|google one|google storage|chatgpt|openai|microsoft 365|office 365|dropbox|adobe|canva|apple\\.com/bill"), "Subscriptions"],
  // Shopping.
  [he("KSP|באג מולטיסיסטם|איביי|אייבורי|מחסני חשמל|שקם אלקטריק"), "Electronics"],
  [en("ksp|ivory|bug multisystem"), "Electronics"],
  [he("איקאה|עצמלה"), "Furniture"],
  [en("ikea"), "Furniture"],
  [he("הום סנטר|אייס|ביתילי|טמבור"), "Home"],
  [en("home center|ace hardware"), "Home"],
  [he("זארה|קסטרו|פוקס|גולף|אמריקן איגל|טרמינל איקס|רנואר|מנגו|נייקי|אדידס|ברשקה|פול אנד בר|H&M"), "Clothing & Shoes"],
  [en("zara|castro|terminal ?x|shein|nike|adidas|mango|bershka|pull ?& ?bear|h&m|american eagle|renuar"), "Clothing & Shoes"],
  [he("עלי אקספרס|אמזון|טמו"), "Shopping"],
  [en("aliexpress|amazon|temu"), "Shopping"],
  [he("מספרה"), "Haircuts"],
  // Leisure.
  [he("סינמה סיטי|יס פלאנט|רב חן|לב סינמה|סינמטק"), "Entertainment"],
  [en("cinema city|yes planet|eventim"), "Entertainment"],
  [he("הולמס פלייס|גו אקטיב|ספייס|מכון כושר|קאנטרי"), "Sports & Hobbies"],
  [en("holmes place|go active"), "Sports & Hobbies"],
  [he("סטימצקי|צומת ספרים"), "Books"],
  [he("אל על|ישראייר|ארקיע|בוקינג"), "Travel"],
  [en("el al|israir|arkia|booking\\.com|airbnb|expedia|wizz ?air|ryanair|easyjet|agoda|hotels\\.com"), "Travel"],
  // Money.
  [he("משיכת מזומן|משיכה מכספומט|כספומט"), "Cash & ATM"],
  [en("atm|cash withdrawal"), "Cash & ATM"],
  [he("עמלת|עמלה|דמי ניהול חשבון|דמי כרטיס"), "Bank Fees"],
  [he("ריבית חובה|ריבית על יתרת חובה"), "Interest"],
  // Giving.
  [he("תרומה|תרומת|עמותת|ע\"ר|ג'יגיב|ישראל גיבס"), "Donations"],
  [en("jgive|israelgives|donation"), "Donations"],
];

const INCOME: Entry[] = [
  [he("משכורת|שכר עבודה"), "Salary"],
  [he("קצבת ילדים|דמי לידה|דמי אבטלה|קצבת זקנה|קצבת נכות|ביטוח לאומי|מענק עבודה"), "Benefits & Allowances"],
  [he("החזר מס|החזר מס הכנסה"), "Tax Refunds"],
  [he("דיבידנד|ריבית זכות"), "Investment Income"],
];

/** The category name a description almost certainly belongs to, or null when it isn't a known merchant. */
export function dictionaryCategory(description: string, kind: "expense" | "income"): string | null {
  const d = description.normalize("NFC").replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  for (const [re, name] of kind === "income" ? INCOME : EXPENSE) if (re.test(d)) return name;
  return null;
}
