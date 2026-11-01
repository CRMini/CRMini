import { SAO_PAULO_TIME_ZONE } from "@/lib/brazil-date";

type GreetingPeriod = "morning" | "afternoon" | "evening";

const greetings = {
  morning: [
    "Bom dia",
    "Que bom ter você por aqui",
    "Um ótimo começo de dia",
    "Comece o dia com boas ideias",
    "Que seu dia seja produtivo",
    "Um dia cheio de conquistas para você",
    "A paz de Cristo",
    "Que Deus abençoe seu dia",
    "Que a graça de Deus acompanhe seu dia",
    "Que o Senhor ilumine seus caminhos",
    "Bom dia, na paz do Senhor",
    "Que Deus renove suas forças nesta manhã",
  ],
  afternoon: [
    "Boa tarde",
    "Espero que sua tarde esteja indo bem",
    "Uma excelente tarde para você",
    "Vamos fazer desta tarde um sucesso",
    "Que sua tarde renda bons frutos",
    "Uma tarde de boas realizações",
    "A paz de Cristo",
    "Que Deus abençoe sua tarde",
    "Que a graça de Deus esteja com você nesta tarde",
    "Que o Senhor conduza sua tarde",
    "Boa tarde, na paz do Senhor",
    "Que Deus renove suas forças nesta tarde",
  ],
  evening: [
    "Boa noite",
    "Que sua noite seja tranquila",
    "Uma ótima noite para você",
    "Que seu dia termine muito bem",
    "Desacelere e aproveite sua noite",
    "Uma noite de paz e descanso",
    "A paz de Cristo",
    "Que Deus abençoe sua noite",
    "Que a paz de Deus esteja com você",
    "Que o Senhor guarde sua noite",
    "Boa noite, na paz do Senhor",
    "Que Deus lhe conceda uma noite serena",
  ],
} as const satisfies Record<GreetingPeriod, readonly string[]>;

export function getGreeting(
  date: Date = new Date(),
  name?: string | null,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const partsByType = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const getPart = (type: string) => Number(partsByType[type]);
  const hour = getPart("hour");
  const period: GreetingPeriod =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const dayKey =
    getPart("year") * 10000 + getPart("month") * 100 + getPart("day");
  const phrase = greetings[period][dayKey % greetings[period].length];
  const trimmedName = name?.trim();

  return trimmedName ? `${phrase}, ${trimmedName}` : phrase;
}

export function getDashboardDate(date: Date = new Date()): string {
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);

  return formattedDate.toLocaleUpperCase("pt-BR");
}
