/**
 * Sweden's 21 counties (län) with slugs, labels, and default region keywords.
 * Used as the canonical source for region selection in the CRM.
 */
export const SWEDISH_COUNTIES = [
  {
    slug: "blekinge",
    label: "Blekinge",
    keywords: ["blekinge", "karlskrona", "karlshamn", "ronneby", "sölvesborg"],
  },
  {
    slug: "dalarna",
    label: "Dalarna",
    keywords: ["dalarna", "falun", "borlänge", "mora", "ludvika", "avesta"],
  },
  {
    slug: "gavleborg",
    label: "Gävleborg",
    keywords: ["gävleborg", "gävle", "sandviken", "hudiksvall", "söderhamn"],
  },
  {
    slug: "gotland",
    label: "Gotland",
    keywords: ["gotland", "visby"],
  },
  {
    slug: "halland",
    label: "Halland",
    keywords: ["halland", "halmstad", "varberg", "falkenberg", "kungsbacka"],
  },
  {
    slug: "jamtland",
    label: "Jämtland",
    keywords: ["jämtland", "östersund", "åre", "krokom"],
  },
  {
    slug: "jonkoping",
    label: "Jönköping",
    keywords: ["jönköping", "huskvarna", "nässjö", "värnamo", "vetlanda"],
  },
  {
    slug: "kalmar",
    label: "Kalmar",
    keywords: ["kalmar", "västervik", "oskarshamn", "nybro", "öland"],
  },
  {
    slug: "kronoberg",
    label: "Kronoberg",
    keywords: ["kronoberg", "växjö", "ljungby", "älmhult"],
  },
  {
    slug: "norrbotten",
    label: "Norrbotten",
    keywords: ["norrbotten", "luleå", "piteå", "boden", "kiruna", "gällivare"],
  },
  {
    slug: "skane",
    label: "Skåne",
    keywords: ["skåne", "malmö", "helsingborg", "lund", "kristianstad", "landskrona", "ystad"],
  },
  {
    slug: "stockholm",
    label: "Stockholm",
    keywords: ["stockholm", "södertälje", "norrtälje", "nacka", "huddinge"],
  },
  {
    slug: "sodermanland",
    label: "Södermanland",
    keywords: ["södermanland", "sörmland", "eskilstuna", "nyköping", "katrineholm"],
  },
  {
    slug: "uppsala",
    label: "Uppsala",
    keywords: ["uppsala", "uppland", "enköping", "knivsta", "östhammar", "tierp"],
  },
  {
    slug: "varmland",
    label: "Värmland",
    keywords: ["värmland", "karlstad", "kristinehamn", "arvika", "hagfors"],
  },
  {
    slug: "vasterbotten",
    label: "Västerbotten",
    keywords: ["västerbotten", "umeå", "skellefteå", "lycksele"],
  },
  {
    slug: "vasternorrland",
    label: "Västernorrland",
    keywords: ["västernorrland", "sundsvall", "härnösand", "örnsköldsvik", "ånge"],
  },
  {
    slug: "vastmanland",
    label: "Västmanland",
    keywords: ["västmanland", "västerås", "sala", "köping", "fagersta"],
  },
  {
    slug: "vastra-gotaland",
    label: "Västra Götaland",
    keywords: ["västra götaland", "göteborg", "borås", "trollhättan", "uddevalla", "skövde"],
  },
  {
    slug: "orebro",
    label: "Örebro",
    keywords: ["örebro", "karlskoga", "kumla", "lindesberg"],
  },
  {
    slug: "ostergotland",
    label: "Östergötland",
    keywords: ["östergötland", "linköping", "norrköping", "motala"],
  },
] as const;

export type SwedishCountySlug = (typeof SWEDISH_COUNTIES)[number]["slug"];
