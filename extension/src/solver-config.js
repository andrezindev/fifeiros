// Configuração compartilhada entre background e popup.
export const SOLVER_URL = "http://127.0.0.1:8127";

// "Priorizar" -> quanto um intransferível "vale" (fração do preço; ver cost.py).
export const PRIORITIES = {
  cost: { label: "Menor custo (padrão)", untradeable_value: 0.3 },
  rating: { label: "Menor overall primeiro", untradeable_value: 0 },
  protect: { label: "Proteger cartas boas", untradeable_value: 0.5 },
};

export const DEFAULT_OPTIONS = {
  min_rating: 45,          // faixa de overall dos jogadores usados
  max_rating: 99,
  priority: "cost",
  replace_players: true,   // desligado: mantém os jogadores já colocados no DME
  only_untradeable: false, // "Somente não negociáveis"
  exclude_active: false,   // "Excluir atletas do elenco ativo"
  allow_special: false,    // cartas de evento
  allow_market: false,     // "Usar atletas de conceito" (em breve)
  time_limit_s: 10,
};

/** Opções da extensão -> opções que o servidor do solver entende. */
export function toSolverOptions(o) {
  const opts = { ...DEFAULT_OPTIONS, ...(o ?? {}) };
  // Compatibilidade com versões antigas (max_rating null, allow_tradeable, untradeable_value).
  const min = Number.isInteger(opts.min_rating) ? opts.min_rating : 45;
  const max = Number.isInteger(opts.max_rating) ? opts.max_rating : 99;
  const allowTradeable = o?.allow_tradeable !== undefined && o?.only_untradeable === undefined
    ? Boolean(o.allow_tradeable)
    : !opts.only_untradeable;
  const uv = PRIORITIES[opts.priority]?.untradeable_value ?? opts.untradeable_value ?? 0.3;
  return {
    min_rating: min > 45 ? min : null,
    max_rating: max < 99 ? max : null,
    untradeable_value: uv,
    allow_special: Boolean(opts.allow_special),
    allow_tradeable: allowTradeable,
    time_limit_s: opts.time_limit_s,
  };
}
