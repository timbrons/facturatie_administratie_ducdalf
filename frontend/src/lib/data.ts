import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { stelAfzenderIn } from "./gmail"
import { pb } from "./pb"
import type {
  Betaling, Factuur, MailLog, MailSjabloon, TbAangifte,
  Boeking, ExtraRecord, Huurder, Instellingen, Nummerreeks, SeizoenRecord, Statuswijziging, TbTariefRecord,
  WorkflowStapRecord,
} from "./types"

// Kleine laag boven PocketBase + React Query. Alle schermen halen hun data
// hier vandaan, zodat het cachen en verversen op één plek geregeld is.

export const sleutels = {
  instellingen: ["instellingen"] as const,
  stappen: ["workflow_stappen"] as const,
  seizoenen: ["seizoenen"] as const,
  extras: ["extras"] as const,
  tbTarieven: ["tb_tarieven"] as const,
  boekingen: ["boekingen"] as const,
  boeking: (id: string) => ["boekingen", id] as const,
  huurders: ["huurders"] as const,
  huurder: (id: string) => ["huurders", id] as const,
  historie: (id: string) => ["statuswijzigingen", id] as const,
  nummerreeksen: ["nummerreeksen"] as const,
  facturen: ["facturen"] as const,
  betalingen: ["betalingen"] as const,
  tbAangiften: ["tb_aangiften"] as const,
  sjablonen: ["mail_sjablonen"] as const,
  maillog: ["mail_log"] as const,
}

export function useInstellingen() {
  return useQuery({
    queryKey: sleutels.instellingen,
    queryFn: async () => {
      const inst = await pb.collection("instellingen").getFirstListItem<Instellingen>("")
      stelAfzenderIn(inst.afzender_email)
      return inst
    },
    staleTime: 60_000,
  })
}

export function useStappen() {
  return useQuery({
    queryKey: sleutels.stappen,
    queryFn: () => pb.collection("workflow_stappen").getFullList<WorkflowStapRecord>({ sort: "volgorde" }),
    staleTime: 60_000,
  })
}

export function useSeizoenen() {
  return useQuery({
    queryKey: sleutels.seizoenen,
    queryFn: () => pb.collection("seizoenen").getFullList<SeizoenRecord>({ sort: "van" }),
  })
}

export function useExtras() {
  return useQuery({
    queryKey: sleutels.extras,
    queryFn: () => pb.collection("extras").getFullList<ExtraRecord>({ sort: "volgorde,naam" }),
  })
}

export function useTbTarieven() {
  return useQuery({
    queryKey: sleutels.tbTarieven,
    queryFn: () => pb.collection("tb_tarieven").getFullList<TbTariefRecord>({ sort: "geldig_vanaf" }),
  })
}

/** Alle boekingen met huurder. Voor twee gebruikers en enkele tientallen boekingen per jaar is dit ruim voldoende. */
export function useBoekingen() {
  return useQuery({
    queryKey: sleutels.boekingen,
    queryFn: () => pb.collection("boekingen").getFullList<Boeking>({ sort: "aankomst", expand: "huurder" }),
  })
}

export function useBoeking(id: string | undefined) {
  return useQuery({
    queryKey: sleutels.boeking(id ?? ""),
    queryFn: () => pb.collection("boekingen").getOne<Boeking>(id!, { expand: "huurder" }),
    enabled: !!id,
  })
}

export function useHistorie(boekingId: string | undefined) {
  return useQuery({
    queryKey: sleutels.historie(boekingId ?? ""),
    queryFn: () =>
      pb.collection("statuswijzigingen").getFullList<Statuswijziging>({
        filter: pb.filter("boeking = {:id}", { id: boekingId }),
        sort: "-created",
      }),
    enabled: !!boekingId,
  })
}

export function useHuurders() {
  return useQuery({
    queryKey: sleutels.huurders,
    queryFn: () => pb.collection("huurders").getFullList<Huurder>({ sort: "achternaam,voornaam" }),
  })
}

export function useHuurder(id: string | undefined) {
  return useQuery({
    queryKey: sleutels.huurder(id ?? ""),
    queryFn: () => pb.collection("huurders").getOne<Huurder>(id!),
    enabled: !!id,
  })
}

export function useNummerreeksen() {
  return useQuery({
    queryKey: sleutels.nummerreeksen,
    queryFn: () => pb.collection("nummerreeksen").getFullList<Nummerreeks>({ sort: "-jaar" }),
  })
}

/** Generieke opslag-mutatie die daarna de opgegeven query's ververst. */
export function useOpslaan<T>(collectie: string, ververs: readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> | FormData }) =>
      id
        ? pb.collection(collectie).update<T & { id: string }>(id, data)
        : pb.collection(collectie).create<T & { id: string }>(data),
    onSuccess: () => {
      for (const k of ververs) qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useVerwijderen(collectie: string, ververs: readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection(collectie).delete(id),
    onSuccess: () => {
      for (const k of ververs) qc.invalidateQueries({ queryKey: k })
    },
  })
}

export function useFacturen() {
  return useQuery({
    queryKey: sleutels.facturen,
    queryFn: () => pb.collection("facturen").getFullList<Factuur>({ sort: "factuurdatum,created" }),
  })
}

export function useBetalingen() {
  return useQuery({
    queryKey: sleutels.betalingen,
    queryFn: () => pb.collection("betalingen").getFullList<Betaling>({ sort: "datum,created" }),
  })
}

export function useTbAangiften() {
  return useQuery({
    queryKey: sleutels.tbAangiften,
    queryFn: () => pb.collection("tb_aangiften").getFullList<TbAangifte>({ sort: "periode" }),
  })
}

export function useSjablonen() {
  return useQuery({
    queryKey: sleutels.sjablonen,
    queryFn: () => pb.collection("mail_sjablonen").getFullList<MailSjabloon>({ sort: "sleutel,taal" }),
  })
}

/** Alle verstuurde mails (ook nodig voor de actielijst: welke herinneringen zijn al verstuurd). */
export function useMaillog() {
  return useQuery({
    queryKey: sleutels.maillog,
    queryFn: () => pb.collection("mail_log").getFullList<MailLog>({ sort: "-created" }),
  })
}
