use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header::CONTENT_TYPE},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use uuid::Uuid;

const CARD_IDS: [&str; 18] = [
    "anchor", "anvil", "arrow", "bell", "crown", "compass", "fox", "gate", "hammer", "horn", "key",
    "lantern", "leaf", "owl", "shield", "star", "tower", "wave",
];
const DRAFT_SECONDS: u64 = 120;
const BATTLE_SECONDS: u64 = 180;
const REQUEST_LIMIT: usize = 60;
const REQUEST_WINDOW_SECONDS: u64 = 60;
static CODE_COUNTER: AtomicU64 = AtomicU64::new(1);
const BUILD_SHA: &str = match option_env!("BUILD_SHA") {
    Some(value) => value,
    None => "dev",
};

#[derive(Clone)]
struct AppState {
    db_path: Arc<String>,
    db_lock: Arc<Mutex<()>>,
    requests: Arc<Mutex<HashMap<String, Vec<u64>>>>,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

#[derive(Debug)]
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(ErrorBody { error: self.1 })).into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Player {
    id: String,
    name: String,
    token: String,
    seat: usize,
    cards: Vec<String>,
    score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Tactic {
    Advance,
    Brace,
    Feint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BattlePlay {
    card_id: String,
    tactic: Tactic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ResolvedPlay {
    #[serde(rename = "playerId")]
    player_id: String,
    #[serde(rename = "cardId")]
    card_id: String,
    tactic: Tactic,
    value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BattleRecord {
    round: u8,
    plays: Vec<ResolvedPlay>,
    #[serde(rename = "winnerId")]
    winner_id: String,
    #[serde(rename = "runnerUpId", skip_serializing_if = "Option::is_none")]
    runner_up_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Phase {
    Lobby,
    Draft {
        round: u8,
        available: Vec<String>,
        picks: HashMap<String, String>,
        deadline: u64,
    },
    Battle {
        round: u8,
        picks: HashMap<String, BattlePlay>,
        deadline: u64,
    },
    Result {
        winner_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Room {
    code: String,
    max_players: usize,
    host_id: String,
    set_id: String,
    seed: u64,
    rematch: u8,
    players: Vec<Player>,
    phase: Phase,
    records: Vec<BattleRecord>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Deserialize)]
struct CreateRoom {
    name: String,
    players: usize,
    #[serde(rename = "setId")]
    set_id: Option<String>,
}
#[derive(Deserialize)]
struct JoinRoom {
    name: String,
}
#[derive(Deserialize)]
struct TokenBody {
    token: String,
}
#[derive(Deserialize)]
struct DraftBody {
    token: String,
    #[serde(rename = "cardId")]
    card_id: String,
}
#[derive(Deserialize)]
struct BattleBody {
    token: String,
    #[serde(rename = "cardId")]
    card_id: String,
    tactic: Tactic,
}
#[derive(Deserialize)]
struct TokenQuery {
    token: String,
}

#[derive(Serialize)]
struct PublicPlayer {
    id: String,
    name: String,
    seat: usize,
    score: i32,
    #[serde(rename = "cardCount")]
    card_count: usize,
}
#[derive(Serialize)]
struct PlayerView {
    id: String,
    name: String,
    seat: usize,
    cards: Vec<String>,
    score: i32,
}
#[derive(Serialize)]
struct RoomView {
    code: String,
    #[serde(rename = "setId")]
    set_id: String,
    status: String,
    player: PlayerView,
    players: Vec<PublicPlayer>,
    #[serde(rename = "draftRound")]
    draft_round: u8,
    #[serde(rename = "battleRound")]
    battle_round: u8,
    offers: Vec<String>,
    #[serde(rename = "lockedCount")]
    locked_count: usize,
    #[serde(rename = "maxPlayers")]
    max_players: usize,
    records: Vec<BattleRecord>,
    #[serde(rename = "winnerId", skip_serializing_if = "Option::is_none")]
    winner_id: Option<String>,
    message: String,
    #[serde(rename = "isHost")]
    is_host: bool,
}

#[derive(Serialize)]
struct CreatedRoom {
    code: String,
    token: String,
    room: RoomView,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn clean_name(value: &str) -> ApiResult<String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 18 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Use a player name from 1 to 18 characters.".into(),
        ));
    }
    if name.chars().any(|character| character.is_control()) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Use a plain player name.".into(),
        ));
    }
    Ok(name.to_string())
}

fn init_db(path: &str) -> Result<(), rusqlite::Error> {
    let connection = Connection::open(path)?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);")?;
    Ok(())
}

fn load_room(connection: &Connection, code: &str) -> ApiResult<Room> {
    let json: String = connection
        .query_row(
            "SELECT state FROM rooms WHERE code = ?1",
            params![code],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                ApiError(StatusCode::NOT_FOUND, "Room code not found.".into())
            }
            _ => ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not read this room.".into(),
            ),
        })?;
    serde_json::from_str(&json).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "This room data could not be read.".into(),
        )
    })
}

fn save_room(connection: &Connection, room: &Room) -> ApiResult<()> {
    let json = serde_json::to_string(room).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not save this room.".into(),
        )
    })?;
    connection.execute("INSERT INTO rooms (code, state, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(code) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at", params![room.code, json, room.updated_at])
        .map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Could not save this room.".into()))?;
    Ok(())
}

fn token_player<'a>(room: &'a Room, token: &str) -> ApiResult<&'a Player> {
    room.players
        .iter()
        .find(|player| player.token == token)
        .ok_or_else(|| {
            ApiError(
                StatusCode::UNAUTHORIZED,
                "This reconnect token does not match the room.".into(),
            )
        })
}

fn next_seed(seed: &mut u64) -> u64 {
    *seed = seed.wrapping_add(0x9e3779b97f4a7c15);
    let mut value = *seed;
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
    value ^ (value >> 31)
}

fn shuffled<T: Clone>(items: &[T], seed: u64) -> Vec<T> {
    let mut output = items.to_vec();
    let mut state = seed;
    for index in (1..output.len()).rev() {
        let pick = (next_seed(&mut state) as usize) % (index + 1);
        output.swap(index, pick);
    }
    output
}

fn draft_offers(available: &[String], seed: u64, round: u8) -> Vec<String> {
    shuffled(available, seed.wrapping_add(u64::from(round) * 73))
        .into_iter()
        .take(6)
        .collect()
}

fn ordered_player_ids(room: &Room, extra_seed: u64, round: u8) -> Vec<String> {
    let mut players = room.players.clone();
    players.sort_by_key(|player| player.seat);
    let start = ((room
        .seed
        .wrapping_add(extra_seed)
        .wrapping_add(u64::from(round) - 1)) as usize)
        % players.len();
    players.rotate_left(start);
    players.into_iter().map(|player| player.id).collect()
}

fn card_value(set_id: &str, card_id: &str, tactic: &Tactic) -> i32 {
    let stats = match card_id {
        "anchor" => [1, 5, 2],
        "anvil" => [2, 5, 1],
        "arrow" => [5, 1, 2],
        "bell" => [2, 3, 4],
        "crown" => [4, 2, 3],
        "compass" => [3, 2, 4],
        "fox" => [3, 1, 5],
        "gate" => [1, 4, 3],
        "hammer" => [5, 2, 1],
        "horn" => [4, 1, 3],
        "key" => [2, 2, 5],
        "lantern" => [2, 3, 4],
        "leaf" => [3, 3, 3],
        "owl" => [1, 3, 5],
        "shield" => [1, 5, 2],
        "star" => [4, 3, 1],
        "tower" => [2, 4, 2],
        "wave" => [4, 1, 4],
        _ => [0, 0, 0],
    };
    let index = match tactic {
        Tactic::Advance => 0,
        Tactic::Brace => 1,
        Tactic::Feint => 2,
    };
    // Stone and Market are balanced paid sets: every original card keeps the
    // same three values, but their tactical columns rotate in opposite ways.
    let adjusted = match set_id {
        "stone" => (index + 1) % 3,
        "market" => (index + 2) % 3,
        _ => index,
    };
    stats[adjusted]
}

fn resolve_draft(
    room: &mut Room,
    round: u8,
    available: &mut Vec<String>,
    picks: &HashMap<String, String>,
) {
    let offers = draft_offers(available, room.seed, round);
    for player_id in ordered_player_ids(room, 0, round) {
        let wanted = picks.get(&player_id).cloned();
        let allocated = wanted
            .filter(|id| available.contains(id))
            .or_else(|| offers.iter().find(|id| available.contains(*id)).cloned())
            .expect("there are enough cards for every player");
        available.retain(|id| id != &allocated);
        if let Some(player) = room
            .players
            .iter_mut()
            .find(|player| player.id == player_id)
        {
            player.cards.push(allocated);
        }
    }
    if round == 3 {
        room.phase = Phase::Battle {
            round: 1,
            picks: HashMap::new(),
            deadline: now() + BATTLE_SECONDS,
        };
    } else {
        room.phase = Phase::Draft {
            round: round + 1,
            available: available.clone(),
            picks: HashMap::new(),
            deadline: now() + DRAFT_SECONDS,
        };
    }
}

fn fallback_battle_play(player: &Player, set_id: &str, round: u8) -> BattlePlay {
    let tactic = match (player.seat + usize::from(round) - 1) % 3 {
        0 => Tactic::Advance,
        1 => Tactic::Brace,
        _ => Tactic::Feint,
    };
    let card_id = player
        .cards
        .iter()
        .max_by_key(|id| card_value(set_id, id, &tactic))
        .cloned()
        .unwrap_or_default();
    BattlePlay { card_id, tactic }
}

fn resolve_battle(room: &mut Room, round: u8, picks: &HashMap<String, BattlePlay>) {
    let priority = ordered_player_ids(room, 19, round);
    let rank: HashMap<String, usize> = priority
        .iter()
        .enumerate()
        .map(|(index, id)| (id.clone(), index))
        .collect();
    let mut plays: Vec<ResolvedPlay> = room
        .players
        .iter()
        .map(|player| {
            let pick = picks
                .get(&player.id)
                .cloned()
                .unwrap_or_else(|| fallback_battle_play(player, &room.set_id, round));
            ResolvedPlay {
                player_id: player.id.clone(),
                value: card_value(&room.set_id, &pick.card_id, &pick.tactic),
                card_id: pick.card_id,
                tactic: pick.tactic,
            }
        })
        .collect();
    plays.sort_by(|left, right| {
        right
            .value
            .cmp(&left.value)
            .then_with(|| rank[&left.player_id].cmp(&rank[&right.player_id]))
    });
    let winner_id = plays[0].player_id.clone();
    let runner_up_id = plays.get(1).map(|play| play.player_id.clone());
    for player in &mut room.players {
        if let Some(play) = plays.iter().find(|play| play.player_id == player.id) {
            player.cards.retain(|id| id != &play.card_id);
        }
        if player.id == winner_id {
            player.score += 2;
        } else if Some(player.id.clone()) == runner_up_id {
            player.score += 1;
        }
    }
    room.records.push(BattleRecord {
        round,
        plays,
        winner_id,
        runner_up_id,
    });
    if round == 3 {
        let final_order = ordered_player_ids(room, 41, 3);
        let final_rank: HashMap<String, usize> = final_order
            .iter()
            .enumerate()
            .map(|(index, id)| (id.clone(), index))
            .collect();
        let winner_id = room
            .players
            .iter()
            .max_by(|left, right| {
                left.score
                    .cmp(&right.score)
                    .then_with(|| final_rank[&right.id].cmp(&final_rank[&left.id]))
            })
            .expect("room has players")
            .id
            .clone();
        room.phase = Phase::Result { winner_id };
    } else {
        room.phase = Phase::Battle {
            round: round + 1,
            picks: HashMap::new(),
            deadline: now() + BATTLE_SECONDS,
        };
    }
}

fn resolve_expired(room: &mut Room) -> bool {
    let current = now();
    match room.phase.clone() {
        Phase::Draft {
            round,
            mut available,
            mut picks,
            deadline,
        } if current >= deadline => {
            let offers = draft_offers(&available, room.seed, round);
            for player in &room.players {
                picks.entry(player.id.clone()).or_insert_with(|| {
                    offers[(player.seat + usize::from(round) - 1) % offers.len()].clone()
                });
            }
            resolve_draft(room, round, &mut available, &picks);
            true
        }
        Phase::Battle {
            round,
            mut picks,
            deadline,
        } if current >= deadline => {
            for player in &room.players {
                picks
                    .entry(player.id.clone())
                    .or_insert_with(|| fallback_battle_play(player, &room.set_id, round));
            }
            resolve_battle(room, round, &picks);
            true
        }
        _ => false,
    }
}

fn to_view(room: &Room, token: &str) -> ApiResult<RoomView> {
    let player = token_player(room, token)?;
    let (status, draft_round, battle_round, offers, locked_count, winner_id, message) =
        match &room.phase {
            Phase::Lobby => (
                "lobby".into(),
                0,
                0,
                vec![],
                0,
                None,
                format!(
                    "{} of {} players have joined.",
                    room.players.len(),
                    room.max_players
                ),
            ),
            Phase::Draft {
                round,
                available,
                picks,
                ..
            } => (
                "draft".into(),
                *round,
                0,
                draft_offers(available, room.seed, *round),
                picks.len(),
                None,
                if picks.contains_key(&player.id) {
                    "Your draft pick is locked. Waiting for the room.".into()
                } else {
                    "Choose one card from the shared row.".into()
                },
            ),
            Phase::Battle { round, picks, .. } => (
                "battle".into(),
                0,
                *round,
                vec![],
                picks.len(),
                None,
                if picks.contains_key(&player.id) {
                    "Your card and tactic are locked. Waiting for the room.".into()
                } else {
                    "Choose one card and one tactic.".into()
                },
            ),
            Phase::Result { winner_id } => (
                "result".into(),
                0,
                0,
                vec![],
                0,
                Some(winner_id.clone()),
                "Three battles are complete.".into(),
            ),
        };
    Ok(RoomView {
        code: room.code.clone(),
        set_id: room.set_id.clone(),
        status,
        player: PlayerView {
            id: player.id.clone(),
            name: player.name.clone(),
            seat: player.seat,
            cards: player.cards.clone(),
            score: player.score,
        },
        players: room
            .players
            .iter()
            .map(|item| PublicPlayer {
                id: item.id.clone(),
                name: item.name.clone(),
                seat: item.seat,
                score: item.score,
                card_count: item.cards.len(),
            })
            .collect(),
        draft_round,
        battle_round,
        offers,
        locked_count,
        max_players: room.max_players,
        records: room.records.clone(),
        winner_id,
        message,
        is_host: player.id == room.host_id,
    })
}

fn room_code() -> String {
    let letters = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut source = now()
        .wrapping_mul(7_919)
        .wrapping_add(CODE_COUNTER.fetch_add(1, Ordering::Relaxed));
    let mut code = String::with_capacity(6);
    for _ in 0..6 {
        code.push(letters[(next_seed(&mut source) as usize) % letters.len()] as char);
    }
    code
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status":"ok", "build": BUILD_SHA}))
}

async fn create_room(
    State(state): State<AppState>,
    Json(body): Json<CreateRoom>,
) -> ApiResult<(StatusCode, Json<CreatedRoom>)> {
    let name = clean_name(&body.name)?;
    if !(2..=4).contains(&body.players) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Choose 2, 3, or 4 players.".into(),
        ));
    }
    let set_id = body.set_id.unwrap_or_else(|| "marsh".into());
    if set_id != "marsh" {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "That draft set needs the host set unlock. Billing activation is not available yet."
                .into(),
        ));
    }
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let code = room_code();
    let token = Uuid::new_v4().to_string();
    let player = Player {
        id: Uuid::new_v4().to_string(),
        name,
        token: token.clone(),
        seat: 0,
        cards: vec![],
        score: 0,
    };
    let time = now();
    let room = Room {
        code: code.clone(),
        max_players: body.players,
        host_id: player.id.clone(),
        set_id,
        seed: time
            .wrapping_mul(3_571)
            .wrapping_add(CODE_COUNTER.load(Ordering::Relaxed)),
        rematch: 0,
        players: vec![player],
        phase: Phase::Lobby,
        records: vec![],
        created_at: time,
        updated_at: time,
    };
    save_room(&connection, &room)?;
    let view = to_view(&room, &token)?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedRoom {
            code,
            token,
            room: view,
        }),
    ))
}

async fn join_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<JoinRoom>,
) -> ApiResult<Json<CreatedRoom>> {
    let name = clean_name(&body.name)?;
    let code = code.to_uppercase();
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code)?;
    if !matches!(room.phase, Phase::Lobby) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This room has already started.".into(),
        ));
    }
    if room.players.len() >= room.max_players {
        return Err(ApiError(StatusCode::CONFLICT, "This room is full.".into()));
    }
    let token = Uuid::new_v4().to_string();
    room.players.push(Player {
        id: Uuid::new_v4().to_string(),
        name,
        token: token.clone(),
        seat: room.players.len(),
        cards: vec![],
        score: 0,
    });
    room.updated_at = now();
    save_room(&connection, &room)?;
    let view = to_view(&room, &token)?;
    Ok(Json(CreatedRoom {
        code,
        token,
        room: view,
    }))
}

async fn read_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Query(query): Query<TokenQuery>,
) -> ApiResult<Json<RoomView>> {
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code.to_uppercase())?;
    if resolve_expired(&mut room) {
        room.updated_at = now();
        save_room(&connection, &room)?;
    }
    Ok(Json(to_view(&room, &query.token)?))
}

async fn start_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<TokenBody>,
) -> ApiResult<Json<RoomView>> {
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code.to_uppercase())?;
    let player = token_player(&room, &body.token)?;
    if player.id != room.host_id {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Only the host can start this room.".into(),
        ));
    }
    if room.players.len() != room.max_players {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Wait for every seat before starting.".into(),
        ));
    }
    if !matches!(room.phase, Phase::Lobby) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This room has already started.".into(),
        ));
    }
    room.phase = Phase::Draft {
        round: 1,
        available: shuffled(
            &CARD_IDS.iter().map(|id| id.to_string()).collect::<Vec<_>>(),
            room.seed,
        ),
        picks: HashMap::new(),
        deadline: now() + DRAFT_SECONDS,
    };
    room.updated_at = now();
    save_room(&connection, &room)?;
    Ok(Json(to_view(&room, &body.token)?))
}

async fn draft(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<DraftBody>,
) -> ApiResult<Json<RoomView>> {
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code.to_uppercase())?;
    if resolve_expired(&mut room) {
        room.updated_at = now();
        save_room(&connection, &room)?;
        return Ok(Json(to_view(&room, &body.token)?));
    }
    let player_id = token_player(&room, &body.token)?.id.clone();
    let Phase::Draft {
        round,
        available,
        picks,
        ..
    } = &mut room.phase
    else {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This room is not drafting now.".into(),
        ));
    };
    if picks.contains_key(&player_id) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Your pick is already locked.".into(),
        ));
    }
    if !draft_offers(available, room.seed, *round).contains(&body.card_id) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Choose a card from this round's shared row.".into(),
        ));
    }
    picks.insert(player_id, body.card_id);
    let should_resolve = picks.len() == room.players.len();
    if should_resolve {
        let (round, mut available, picks) = match room.phase.clone() {
            Phase::Draft {
                round,
                available,
                picks,
                ..
            } => (round, available, picks),
            _ => unreachable!(),
        };
        resolve_draft(&mut room, round, &mut available, &picks);
    }
    room.updated_at = now();
    save_room(&connection, &room)?;
    Ok(Json(to_view(&room, &body.token)?))
}

async fn battle(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<BattleBody>,
) -> ApiResult<Json<RoomView>> {
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code.to_uppercase())?;
    if resolve_expired(&mut room) {
        room.updated_at = now();
        save_room(&connection, &room)?;
        return Ok(Json(to_view(&room, &body.token)?));
    }
    let player = token_player(&room, &body.token)?.clone();
    let Phase::Battle {
        round: _, picks, ..
    } = &mut room.phase
    else {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This room is not in a battle now.".into(),
        ));
    };
    if picks.contains_key(&player.id) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Your battle choice is already locked.".into(),
        ));
    }
    if !player.cards.contains(&body.card_id) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Choose one of your drafted cards.".into(),
        ));
    }
    picks.insert(
        player.id,
        BattlePlay {
            card_id: body.card_id,
            tactic: body.tactic,
        },
    );
    let should_resolve = picks.len() == room.players.len();
    if should_resolve {
        let (round, picks) = match room.phase.clone() {
            Phase::Battle { round, picks, .. } => (round, picks),
            _ => unreachable!(),
        };
        resolve_battle(&mut room, round, &picks);
    }
    room.updated_at = now();
    save_room(&connection, &room)?;
    Ok(Json(to_view(&room, &body.token)?))
}

async fn rematch(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<TokenBody>,
) -> ApiResult<Json<RoomView>> {
    let _lock = state.db_lock.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Room service lock failed.".into(),
        )
    })?;
    let connection = Connection::open(state.db_path.as_str()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not open room storage.".into(),
        )
    })?;
    let mut room = load_room(&connection, &code.to_uppercase())?;
    let player = token_player(&room, &body.token)?;
    if player.id != room.host_id {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Only the host can start a rematch.".into(),
        ));
    }
    if !matches!(room.phase, Phase::Result { .. }) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Finish the current duel before starting a rematch.".into(),
        ));
    }
    room.rematch = room.rematch.wrapping_add(1);
    room.seed = room.seed.wrapping_add(9_973 + u64::from(room.rematch));
    for item in &mut room.players {
        item.cards.clear();
        item.score = 0;
    }
    room.records.clear();
    room.phase = Phase::Draft {
        round: 1,
        available: shuffled(
            &CARD_IDS.iter().map(|id| id.to_string()).collect::<Vec<_>>(),
            room.seed,
        ),
        picks: HashMap::new(),
        deadline: now() + DRAFT_SECONDS,
    };
    room.updated_at = now();
    save_room(&connection, &room)?;
    Ok(Json(to_view(&room, &body.token)?))
}

async fn rate_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if request.uri().path() == "/health" {
        return next.run(request).await;
    }
    let key = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("local")
        .split(',')
        .next()
        .unwrap_or("local")
        .trim()
        .to_string();
    let current = now();
    let allowed = {
        let mut requests = state.requests.lock().expect("rate limiter lock");
        let entries = requests.entry(key).or_default();
        entries.retain(|time| current.saturating_sub(*time) < REQUEST_WINDOW_SECONDS);
        if entries.len() >= REQUEST_LIMIT {
            false
        } else {
            entries.push(current);
            true
        }
    };
    if !allowed {
        let mut response = (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorBody {
                error: "Too many room requests. Wait one minute before trying again.".into(),
            }),
        )
            .into_response();
        response
            .headers_mut()
            .insert("Retry-After", HeaderValue::from_static("60"));
        return response;
    }
    next.run(request).await
}

fn allowed_origin(origin: &HeaderValue) -> bool {
    let Ok(value) = origin.to_str() else {
        return false;
    };
    value == "https://pocket-draft-duel.sociobot.in"
        || value.starts_with("http://127.0.0.1:")
        || value.starts_with("http://localhost:")
}

#[tokio::main]
async fn main() {
    let data_dir = env::var("DATA_DIR").unwrap_or_else(|_| "/data".into());
    let port = env::var("PORT")
        .ok()
        .and_then(|item| item.parse::<u16>().ok())
        .unwrap_or(8080);
    let db_path = format!("{data_dir}/pocket-draft-duel.sqlite");
    println!("Opening product SQLite storage at {db_path}");
    if let Err(error) = std::fs::create_dir_all(&data_dir)
        .and_then(|_| init_db(&db_path).map_err(std::io::Error::other))
    {
        eprintln!("could not initialize room storage: {error}");
        std::process::exit(1);
    }
    let state = AppState {
        db_path: Arc::new(db_path),
        db_lock: Arc::new(Mutex::new(())),
        requests: Arc::new(Mutex::new(HashMap::new())),
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/rooms", post(create_room))
        .route("/rooms/{code}", get(read_room))
        .route("/rooms/{code}/join", post(join_room))
        .route("/rooms/{code}/start", post(start_room))
        .route("/rooms/{code}/draft", post(draft))
        .route("/rooms/{code}/battle", post(battle))
        .route("/rooms/{code}/rematch", post(rematch))
        .layer(middleware::from_fn_with_state(state.clone(), rate_limit))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(|origin, _| allowed_origin(origin)))
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers([CONTENT_TYPE]),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Pocket Draft Duel room service listening on {address}");
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind room service");
    axum::serve(listener, app)
        .await
        .expect("serve room service");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two_player_room() -> Room {
        let players = vec![
            Player {
                id: "a".into(),
                name: "A".into(),
                token: "one".into(),
                seat: 0,
                cards: vec![],
                score: 0,
            },
            Player {
                id: "b".into(),
                name: "B".into(),
                token: "two".into(),
                seat: 1,
                cards: vec![],
                score: 0,
            },
        ];
        Room {
            code: "ABC123".into(),
            max_players: 2,
            host_id: "a".into(),
            set_id: "marsh".into(),
            seed: 99,
            rematch: 0,
            players,
            phase: Phase::Lobby,
            records: vec![],
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn server_resolution_gives_every_player_three_unique_cards() {
        let mut room = two_player_room();
        let mut available = CARD_IDS.iter().map(|id| id.to_string()).collect::<Vec<_>>();
        for round in 1..=3 {
            let offers = draft_offers(&available, room.seed, round);
            let picks = HashMap::from([
                ("a".into(), offers[0].clone()),
                ("b".into(), offers[0].clone()),
            ]);
            resolve_draft(&mut room, round, &mut available, &picks);
            if round < 3 {
                assert!(
                    matches!(room.phase, Phase::Draft { round: next, .. } if next == round + 1)
                );
            }
        }
        assert!(matches!(room.phase, Phase::Battle { round: 1, .. }));
        assert_eq!(room.players[0].cards.len(), 3);
        assert_eq!(room.players[1].cards.len(), 3);
        let all = room
            .players
            .iter()
            .flat_map(|player| player.cards.iter())
            .collect::<Vec<_>>();
        let distinct = all.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(all.len(), distinct.len());
    }

    #[test]
    fn room_view_never_exposes_an_opponents_hand_or_pending_pick() {
        let mut room = two_player_room();
        room.players[0].cards = vec!["arrow".into()];
        room.players[1].cards = vec!["anchor".into(), "shield".into()];
        room.phase = Phase::Battle {
            round: 1,
            picks: HashMap::from([(
                "b".into(),
                BattlePlay {
                    card_id: "anchor".into(),
                    tactic: Tactic::Brace,
                },
            )]),
            deadline: now() + 120,
        };
        let json = serde_json::to_value(to_view(&room, "one").unwrap()).unwrap();
        assert_eq!(json["player"]["cards"], serde_json::json!(["arrow"]));
        assert!(json["players"][1].get("cards").is_none());
        assert_eq!(json["players"][1]["cardCount"], 2);
        assert_eq!(json["records"], serde_json::json!([]));
    }

    #[test]
    fn three_battles_always_produce_one_result() {
        let mut room = two_player_room();
        room.players[0].cards = vec!["arrow".into(), "anchor".into(), "fox".into()];
        room.players[1].cards = vec!["shield".into(), "hammer".into(), "tower".into()];
        for round in 1..=3 {
            let picks = HashMap::from([
                (
                    "a".into(),
                    BattlePlay {
                        card_id: room.players[0].cards[0].clone(),
                        tactic: Tactic::Advance,
                    },
                ),
                (
                    "b".into(),
                    BattlePlay {
                        card_id: room.players[1].cards[0].clone(),
                        tactic: Tactic::Brace,
                    },
                ),
            ]);
            resolve_battle(&mut room, round, &picks);
        }
        assert!(matches!(room.phase, Phase::Result { .. }));
        assert_eq!(room.records.len(), 3);
    }
}
