import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ISO|Name|dial code — every country / territory with a phone code
const RAW = "AF|Afghanistan|93,AL|Albania|355,DZ|Algeria|213,AS|American Samoa|1684,AD|Andorra|376,AO|Angola|244,AI|Anguilla|1264,AG|Antigua and Barbuda|1268,AR|Argentina|54,AM|Armenia|374,AW|Aruba|297,AU|Australia|61,AT|Austria|43,AZ|Azerbaijan|994,BS|Bahamas|1242,BH|Bahrain|973,BD|Bangladesh|880,BB|Barbados|1246,BY|Belarus|375,BE|Belgium|32,BZ|Belize|501,BJ|Benin|229,BM|Bermuda|1441,BT|Bhutan|975,BO|Bolivia|591,BA|Bosnia and Herzegovina|387,BW|Botswana|267,BR|Brazil|55,IO|British Indian Ocean Territory|246,VG|British Virgin Islands|1284,BN|Brunei|673,BG|Bulgaria|359,BF|Burkina Faso|226,BI|Burundi|257,KH|Cambodia|855,CM|Cameroon|237,CA|Canada|1,CV|Cape Verde|238,KY|Cayman Islands|1345,CF|Central African Republic|236,TD|Chad|235,CL|Chile|56,CN|China|86,CO|Colombia|57,KM|Comoros|269,CG|Congo|242,CD|Congo (DRC)|243,CK|Cook Islands|682,CR|Costa Rica|506,CI|Côte d'Ivoire|225,HR|Croatia|385,CU|Cuba|53,CW|Curaçao|599,CY|Cyprus|357,CZ|Czechia|420,DK|Denmark|45,DJ|Djibouti|253,DM|Dominica|1767,DO|Dominican Republic|1809,EC|Ecuador|593,EG|Egypt|20,SV|El Salvador|503,GQ|Equatorial Guinea|240,ER|Eritrea|291,EE|Estonia|372,SZ|Eswatini|268,ET|Ethiopia|251,FK|Falkland Islands|500,FO|Faroe Islands|298,FJ|Fiji|679,FI|Finland|358,FR|France|33,GF|French Guiana|594,PF|French Polynesia|689,GA|Gabon|241,GM|Gambia|220,GE|Georgia|995,DE|Germany|49,GH|Ghana|233,GI|Gibraltar|350,GR|Greece|30,GL|Greenland|299,GD|Grenada|1473,GP|Guadeloupe|590,GU|Guam|1671,GT|Guatemala|502,GG|Guernsey|44,GN|Guinea|224,GW|Guinea-Bissau|245,GY|Guyana|592,HT|Haiti|509,HN|Honduras|504,HK|Hong Kong|852,HU|Hungary|36,IS|Iceland|354,IN|India|91,ID|Indonesia|62,IR|Iran|98,IQ|Iraq|964,IE|Ireland|353,IM|Isle of Man|44,IL|Israel|972,IT|Italy|39,JM|Jamaica|1876,JP|Japan|81,JE|Jersey|44,JO|Jordan|962,KZ|Kazakhstan|7,KE|Kenya|254,KI|Kiribati|686,XK|Kosovo|383,KW|Kuwait|965,KG|Kyrgyzstan|996,LA|Laos|856,LV|Latvia|371,LB|Lebanon|961,LS|Lesotho|266,LR|Liberia|231,LY|Libya|218,LI|Liechtenstein|423,LT|Lithuania|370,LU|Luxembourg|352,MO|Macau|853,MG|Madagascar|261,MW|Malawi|265,MY|Malaysia|60,MV|Maldives|960,ML|Mali|223,MT|Malta|356,MH|Marshall Islands|692,MQ|Martinique|596,MR|Mauritania|222,MU|Mauritius|230,YT|Mayotte|262,MX|Mexico|52,FM|Micronesia|691,MD|Moldova|373,MC|Monaco|377,MN|Mongolia|976,ME|Montenegro|382,MS|Montserrat|1664,MA|Morocco|212,MZ|Mozambique|258,MM|Myanmar|95,NA|Namibia|264,NR|Nauru|674,NP|Nepal|977,NL|Netherlands|31,NC|New Caledonia|687,NZ|New Zealand|64,NI|Nicaragua|505,NE|Niger|227,NG|Nigeria|234,NU|Niue|683,KP|North Korea|850,MK|North Macedonia|389,MP|Northern Mariana Islands|1670,NO|Norway|47,OM|Oman|968,PK|Pakistan|92,PW|Palau|680,PS|Palestine|970,PA|Panama|507,PG|Papua New Guinea|675,PY|Paraguay|595,PE|Peru|51,PH|Philippines|63,PL|Poland|48,PT|Portugal|351,PR|Puerto Rico|1787,QA|Qatar|974,RE|Réunion|262,RO|Romania|40,RU|Russia|7,RW|Rwanda|250,BL|Saint Barthélemy|590,SH|Saint Helena|290,KN|Saint Kitts and Nevis|1869,LC|Saint Lucia|1758,MF|Saint Martin|590,PM|Saint Pierre and Miquelon|508,VC|Saint Vincent and the Grenadines|1784,WS|Samoa|685,SM|San Marino|378,ST|São Tomé and Príncipe|239,SA|Saudi Arabia|966,SN|Senegal|221,RS|Serbia|381,SC|Seychelles|248,SL|Sierra Leone|232,SG|Singapore|65,SX|Sint Maarten|1721,SK|Slovakia|421,SI|Slovenia|386,SB|Solomon Islands|677,SO|Somalia|252,ZA|South Africa|27,KR|South Korea|82,SS|South Sudan|211,ES|Spain|34,LK|Sri Lanka|94,SD|Sudan|249,SR|Suriname|597,SE|Sweden|46,CH|Switzerland|41,SY|Syria|963,TW|Taiwan|886,TJ|Tajikistan|992,TZ|Tanzania|255,TH|Thailand|66,TL|Timor-Leste|670,TG|Togo|228,TK|Tokelau|690,TO|Tonga|676,TT|Trinidad and Tobago|1868,TN|Tunisia|216,TR|Türkiye|90,TM|Turkmenistan|993,TC|Turks and Caicos Islands|1649,TV|Tuvalu|688,VI|U.S. Virgin Islands|1340,UG|Uganda|256,UA|Ukraine|380,AE|United Arab Emirates|971,GB|United Kingdom|44,US|United States|1,UY|Uruguay|598,UZ|Uzbekistan|998,VU|Vanuatu|678,VA|Vatican City|39,VE|Venezuela|58,VN|Vietnam|84,WF|Wallis and Futuna|681,YE|Yemen|967,ZM|Zambia|260,ZW|Zimbabwe|263";

export interface Country { iso: string; name: string; dial: string }
export const COUNTRIES: Country[] = RAW.split(",").map((r) => { const [iso, name, d] = r.split("|"); return { iso, name, dial: `+${d}` }; });
const POPULAR = ["IN", "AE", "SA", "US", "GB", "PK", "BD", "NP", "SG", "MY", "AU", "CA"];
export const flag = (iso: string) => iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

/** Best guess for the visitor's country from the browser language (e.g. en-IN → India), falling back to India. */
export function defaultCountry(): Country {
  const region = (navigator.languages?.[0] || navigator.language || "").split("-")[1]?.toUpperCase();
  return COUNTRIES.find((c) => c.iso === region) ?? COUNTRIES.find((c) => c.iso === "IN")!;
}

/** Searchable country-code picker with every country (flag + name + dial code). */
export function CountryCodePicker({ value, onChange, className, testid = "country-code-picker" }: { value: Country; onChange: (c: Country) => void; className?: string; testid?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^\+/, "");
    if (!t) return [...POPULAR.map((i) => COUNTRIES.find((c) => c.iso === i)!), ...COUNTRIES.filter((c) => !POPULAR.includes(c.iso))];
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(t) || c.dial.slice(1).startsWith(t) || c.iso.toLowerCase() === t);
  }, [q]);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger render={<button type="button" className={cn("flex h-9 shrink-0 items-center gap-1 rounded-md border bg-background px-2 text-sm transition-colors duration-150 hover:bg-muted", className)} aria-label={`Country code ${value.name} ${value.dial}`} data-testid={testid} />}>
        <span className="text-base leading-none">{flag(value.iso)}</span><span className="font-medium tabular-nums">{value.dial}</span><ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" data-testid={`${testid}-list`}>
        <div className="flex items-center gap-2 border-b px-2 py-1.5"><Search className="h-4 w-4 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code" className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" data-testid={`${testid}-search`} /></div>
        <div className="max-h-64 overflow-y-auto py-1">
          {list.map((c, i) => (
            <button type="button" key={`${c.iso}-${i}`} onClick={() => { onChange(c); setOpen(false); setQ(""); }} data-testid={`${testid}-option`}
              className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-muted", c.iso === value.iso && "bg-primary/10 font-semibold", !q && i === POPULAR.length - 1 && "border-b")}>
              <span className="text-base">{flag(c.iso)}</span><span className="min-w-0 flex-1 truncate">{c.name}</span><span className="tabular-nums text-muted-foreground">{c.dial}</span>
            </button>
          ))}
          {!list.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No country found</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
