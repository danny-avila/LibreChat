# main.py
import datetime
import os
from pathlib import Path

import dotenv
from app.converter import Converter
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pymongo import MongoClient

# Debug flag
# DEBUG = os.environ.get("DEBUG_CONSOLE_MARKDOWN_HTML_PDF_API") == "true"
DEBUG = True

app = FastAPI(title="Markdown to PDF/HTML Converter")
converter = Converter()


# Adicionar CORS para permitir o frontend acessar a API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ou ["*"] para liberar geral
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[DEBUG] ATIVOU")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    print("[DEBUG] Health check endpoint")
    return {"status": "healthy", "service": "python-tools-api"}


@app.post("/convert/md-to-pdf", response_class=StreamingResponse)
async def convert_md_to_pdf(file: UploadFile = File(...)):
    """
    Upload a Markdown file and receive a PDF.
    """

    if DEBUG:
        print(f"[DEBUG] convert_pdf called with filename: {file.filename}")
    if not file.filename.lower().endswith((".md", ".markdown")):
        if DEBUG:
            print(f"[DEBUG] Invalid file type for PDF: {file.filename}")
        raise HTTPException(status_code=400, detail="Invalid file type. Use .md or .markdown files.")
    data = await file.read()
    if DEBUG:
        print(f"[DEBUG] Read {len(data)} bytes from uploaded file for PDF")
    try:
        pdf_bytes = await converter.to_pdf_bytes(data)
    except Exception as e:
        if DEBUG:
            print(f"[DEBUG] PDF conversion error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF conversion failed: {e}")
    if DEBUG:
        print(f"[DEBUG] Returning PDF of size {len(pdf_bytes)} bytes")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{file.filename.rsplit(".", 1)[0]}.pdf"'},
    )


@app.post("/convert/md-to-html", response_class=StreamingResponse)
async def convert_md_to_html(file: UploadFile = File(...)):
    """
    Upload a Markdown file and receive an HTML.
    """
    if DEBUG:
        print(f"[DEBUG] convert_html called with filename: {file.filename}")
    if not file.filename.lower().endswith((".md", ".markdown")):
        if DEBUG:
            print(f"[DEBUG] Invalid file type for HTML: {file.filename}")
        raise HTTPException(status_code=400, detail="Invalid file type. Use .md or .markdown files.")
    data = await file.read()
    if DEBUG:
        print(f"[DEBUG] Read {len(data)} bytes from uploaded file for HTML")
    try:
        html_bytes = await converter.to_html_bytes(data)
    except Exception as e:
        if DEBUG:
            print(f"[DEBUG] HTML conversion error: {e}")
        raise HTTPException(status_code=500, detail=f"HTML conversion failed: {e}")
    if DEBUG:
        print(f"[DEBUG] Returning HTML of size {len(html_bytes)} bytes")

    return StreamingResponse(
        iter([html_bytes]),
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{file.filename.rsplit(".", 1)[0]}.html"'},
    )


# -------------------------------------------------------------------------
# AUXILIAR IMPORTS AND FUNCTIONS


# MONGO CONNECTION
REPO_ROOT = Path(__file__).resolve().parent.parent
dotenv.load_dotenv(REPO_ROOT / ".env", override=True)
dotenv.load_dotenv(override=True)


def get_mongo_uri() -> str:
    uri = os.getenv("MONGO_URI_SERVER") or os.getenv("MONGO_URI")
    if not uri:
        raise ValueError(
            "Defina MONGO_URI ou MONGO_URI_SERVER no .env "
            "(ex.: mongodb://localhost:27018/LibreChat)"
        )
    return uri


def mask_mongo_uri(uri: str) -> str:
    if "@" not in uri:
        return uri
    prefix, suffix = uri.split("@", 1)
    return f"{prefix.split('://')[0]}://***@{suffix}"


MONGO_URI = get_mongo_uri()
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10_000)

DEBUG_REPORTS = os.getenv("DEBUG_REPORTS", "").lower() in ("1", "true", "yes")


def aggregate_transactions(pipeline: list) -> list:
    try:
        return list(client.LibreChat.transactions.aggregate(pipeline))
    except Exception as exc:
        print(f"[reports] Erro aggregate transactions: {exc}")
        return []


def aggregate_users(pipeline: list) -> list:
    try:
        return list(client.LibreChat.users.aggregate(pipeline))
    except Exception as exc:
        print(f"[reports] Erro aggregate users: {exc}")
        return []


def build_created_at_match(
    start_date: str | None,
    end_date: str | None,
    *,
    default_days: int = 30,
) -> dict:
    if start_date or end_date:
        created_at: dict = {}
        if start_date:
            created_at["$gte"] = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            end_datetime = datetime.datetime.strptime(end_date, "%Y-%m-%d")
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59)
            created_at["$lte"] = end_datetime
        return created_at

    now = datetime.datetime.now()
    return {
        "$gte": now - datetime.timedelta(days=default_days),
        "$lte": now,
    }


@app.on_event("startup")
async def startup_mongo_check() -> None:
    try:
        client.admin.command("ping")
        print(f"[reports] MongoDB conectado: {mask_mongo_uri(MONGO_URI)}")
    except Exception as exc:
        print(f"[reports] MongoDB indisponível ({mask_mongo_uri(MONGO_URI)}): {exc}")


# GET USER DATA
def get_user_data(search_term, search_by="name"):
    try:
        if search_by == "name":
            user = client.LibreChat.users.find_one({"name": search_term})
        else:
            user = client.LibreChat.users.find_one({"username": search_term})
    except Exception as exc:
        print(f"[reports] Erro ao buscar usuário: {exc}")
        return "Usuário não encontrado"
    if not user:
        return "Usuário não encontrado"
    return user


# -------------------------------------------------------------------------
# REPORTS ROUTES

# 🔧 CORREÇÃO IMPORTANTE DE CONTAGEM DE MENSAGENS:
#
# Cada conversa gera 2 transações na collection transactions:
# - tokenType: "prompt" = mensagem do usuário
# - tokenType: "completion" = resposta da IA
#
# ANTES DA CORREÇÃO:
# - get_usage_cost: ✅ CORRETO (já separava prompt/completion)
# - get_top_users_volume: ❌ ERRADO (contava prompt + completion = dobrava)
# - get_top_users_cost: ❌ ERRADO (contava prompt + completion = dobrava)
# - get_top_models: ❌ ERRADO (contava prompt + completion = dobrava)
# - get_user_efficiency: ❌ ERRADO (contava prompt + completion = dobrava)
#
# APÓS A CORREÇÃO:
# Todas as funções agora filtram por tokenType: 'prompt' para contar apenas
# mensagens reais de usuário, representando conversas verdadeiras.


# USAGE COST REPORT
# RETURNS: [{ date: '05/07', 'IA msgs': 100, 'IA custo': 12.50, 'USER msgs': 95, 'USER custo': 8.75 }]
@app.get("/reports/usage-cost")
async def get_usage_cost(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    models: str | None = None,
    search_by: str = "username",
):
    """
    Get usage cost report separated by token type.
    Returns data grouped by date with cost and CONVERSATION count (not individual transactions).
    Now counts unique conversations by conversationId, so USER msgs should match IA msgs closely.
    """
    try:
        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        if models:
            models_list = [m.strip() for m in models.split(",") if m.strip()]
            if models_list:
                match["model"] = {"$in": models_list}

        pipeline.append({"$match": match})

        # Agrupa por data, tokenType e conversationId para contar conversas reais
        pipeline.extend(
        [
            {"$addFields": {"dateOnly": {"$dateToString": {"format": "%d/%m", "date": "$createdAt"}}}},
            {
                "$group": {
                    "_id": {"date": "$dateOnly", "tokenType": "$tokenType", "conversationId": "$conversationId"},
                    "Custo": {
                        "$sum": {
                            "$divide": ["$tokenValue", -1_000_000]  # Converte para valor positivo em reais
                        }
                    },
                    "date_sort": {"$first": "$createdAt"},  # Para ordenação
                }
            },
            {
                "$group": {
                    "_id": {"date": "$_id.date", "tokenType": "$_id.tokenType"},
                    "Custo": {"$sum": "$Custo"},
                    "Mensagens": {"$sum": 1},  # Agora conta conversas únicas por data/tipo
                    "date_sort": {"$first": "$date_sort"},
                }
            },
            {
                "$group": {
                    "_id": "$_id.date",
                    "data": {"$push": {"tokenType": "$_id.tokenType", "Custo": "$Custo", "Mensagens": "$Mensagens"}},
                    "date_sort": {"$first": "$date_sort"},
                }
            },
            {
                "$sort": {"date_sort": 1}  # Ordena por data crescente
            },
        ]
    )

        result = aggregate_transactions(pipeline)
        if not result:
            return []

        formatted_result = []
        for day_data in result:
            date = day_data["_id"]
            entry = {
                "date": date,
                "QUESTIONS": 0,
                "QUESTIONS custo": 0.0,
                "ANSWERS": 0,
                "ANSWERS custo": 0.0,
            }

            for token_data in day_data.get("data", []):
                token_type = token_data["tokenType"]
                custo = round(token_data["Custo"], 2)
                mensagens = token_data["Mensagens"]

                if token_type == "completion":
                    entry["ANSWERS"] = mensagens
                    entry["ANSWERS custo"] = custo
                elif token_type == "prompt":
                    entry["QUESTIONS"] = mensagens
                    entry["QUESTIONS custo"] = custo

            formatted_result.append(entry)

        return formatted_result
    except Exception as exc:
        print(f"[reports] Erro em usage-cost: {exc}")
        return []


# GET ALL AVAILABLE MODELS
@app.get("/reports/available-models")
async def get_available_models():
    """
    Get all available models from the database.
    """
    try:
        pipeline = [
            {"$group": {"_id": "$model", "count": {"$sum": 1}}},
            {"$project": {"_id": 0, "name": "$_id", "count": 1}},
            {"$sort": {"count": -1}},
        ]

        result = aggregate_transactions(pipeline)
        models = [model["name"] for model in result if model["name"]]  # Remove valores None/vazios

        if DEBUG_REPORTS:
            print(f"[DEBUG] Modelos disponíveis encontrados: {models}")

        return models
    except Exception as e:
        print(f"[DEBUG] Erro ao buscar modelos: {e}")
        return []


# TOP USERS BY MESSAGE VOLUME
# RETURNS: [{ username: 'rm810774', name: 'Rafael Da Silva Melo', Volume: 12450, Custo: 145.80 }]
@app.get("/reports/top-users-volume")
async def get_top_users_volume(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get top users by message volume.
    If user is specified, returns that user's message volume over time.
    FIXED: Now counts only user messages (tokenType: 'prompt') instead of all transactions.
    """
    try:
        if limit is not None:
            limit = int(limit)

        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        pipeline.append({"$match": match})

        if user:
            pipeline.extend(
                [
                    {"$addFields": {"dateOnly": {"$dateToString": {"format": "%d/%m", "date": "$createdAt"}}}},
                    {
                        "$group": {
                            "_id": "$dateOnly",
                            "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                            "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                            "date_sort": {"$first": "$createdAt"},
                        }
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "date": "$_id",
                            "Volume": 1,
                            "Custo": {"$round": ["$Custo", 4]},
                            "date_sort": 1,
                        }
                    },
                    {"$sort": {"date_sort": 1}},
                    {"$project": {"date": 1, "Volume": 1, "Custo": 1}},
                ]
            )
        else:
            pipeline.extend(
                [
                    {
                        "$group": {
                            "_id": "$user",
                            "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                            "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                        }
                    },
                    {"$lookup": {"from": "users", "localField": "_id", "foreignField": "_id", "as": "user_info"}},
                    {"$unwind": "$user_info"},
                    {
                        "$project": {
                            "_id": 0,
                            "name": "$user_info.name",
                            "username": "$user_info.username",
                            "costCenter": "$user_info.costCenterCode",
                            "Volume": 1,
                            "Custo": {"$round": ["$Custo", 4]},
                        }
                    },
                    {"$sort": {"Volume": -1}},
                ]
            )
            if limit is not None:
                pipeline.append({"$limit": limit})

        return aggregate_transactions(pipeline)
    except Exception as exc:
        print(f"[reports] Erro em top-users-volume: {exc}")
        return []


# TOP USERS BY COST
# RETURNS: [{ name: 'Ana S.', Volume: 12450, Custo: 145.80 }]
@app.get("/reports/top-users-cost")
async def get_top_users_cost(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get top users by cost.
    If user is specified, returns that user's cost over time.
    FIXED: Now counts only user messages (tokenType: 'prompt') for volume to match real conversations.
    """
    try:
        if limit is not None:
            limit = int(limit)

        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        pipeline.append({"$match": match})

        if user:
            pipeline.extend(
                [
                    {"$addFields": {"dateOnly": {"$dateToString": {"format": "%d/%m", "date": "$createdAt"}}}},
                    {
                        "$group": {
                            "_id": "$dateOnly",
                            "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                            "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                            "date_sort": {"$first": "$createdAt"},
                        }
                    },
                    {
                        "$project": {
                            "_id": 0,
                            "date": "$_id",
                            "Volume": 1,
                            "Custo": {"$round": ["$Custo", 4]},
                            "date_sort": 1,
                        }
                    },
                    {"$sort": {"date_sort": 1}},
                    {"$project": {"date": 1, "Volume": 1, "Custo": 1}},
                ]
            )
        else:
            pipeline.extend(
                [
                    {
                        "$group": {
                            "_id": "$user",
                            "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                            "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                        }
                    },
                    {"$lookup": {"from": "users", "localField": "_id", "foreignField": "_id", "as": "user_info"}},
                    {"$unwind": "$user_info"},
                    {
                        "$project": {
                            "_id": 0,
                            "name": "$user_info.name",
                            "username": "$user_info.username",
                            "costCenter": "$user_info.costCenterCode",
                            "Volume": 1,
                            "Custo": {"$round": ["$Custo", 4]},
                        }
                    },
                    {"$sort": {"Custo": -1}},
                ]
            )
            if limit is not None:
                pipeline.append({"$limit": limit})

        return aggregate_transactions(pipeline)
    except Exception as exc:
        print(f"[reports] Erro em top-users-cost: {exc}")
        return []


# TOP MODELS USAGE
# RETURNS: [{ name: 'GPT-4o', value: 45, Volume: 12450, Custo: 145.80 }]
@app.get("/reports/top-models")
async def get_top_models(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get top models by usage.
    If user is specified, returns that user's model usage.
    FIXED: Now counts only user messages (tokenType: 'prompt') for volume to match real conversations.
    """
    try:
        if limit is not None:
            limit = int(limit)

        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        # Exclude MemoryRun billing so model charts reflect chat usage only
        match["context"] = {"$ne": "memory"}

        pipeline.append({"$match": match})

        pipeline.extend(
            [
                {
                    "$group": {
                        "_id": "$model",
                        "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                        "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "name": "$_id",
                        "Volume": 1,
                        "Custo": {"$round": ["$Custo", 4]},
                        "value": "$Volume",
                    }
                },
                {"$sort": {"Custo": -1} if user else {"Volume": -1}},
            ]
        )

        if limit is not None:
            pipeline.append({"$limit": limit})

        return aggregate_transactions(pipeline)
    except Exception as exc:
        print(f"[reports] Erro em top-models: {exc}")
        return []


# KPIS ENDPOINTS
@app.get("/reports/kpis")
async def get_kpis(start_date: str | None = None, end_date: str | None = None):
    """
    Get KPI data for the dashboard.
    Returns: {
        totalCost: float,
        newUsers: int,
        activeAccounts: int,
        growthRate: float
    }
    """
    try:
        # Filtros de data
        date_match = {}
        if start_date:
            try:
                date_match["$gte"] = datetime.datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                pass

        if end_date:
            try:
                end_datetime = datetime.datetime.strptime(end_date, "%Y-%m-%d")
                end_datetime = end_datetime.replace(hour=23, minute=59, second=59)
                date_match["$lte"] = end_datetime
            except ValueError:
                pass

        # Se não tiver datas, usa últimos 30 dias
        if not date_match:
            date_match["$gte"] = datetime.datetime.now() - datetime.timedelta(days=30)
            date_match["$lte"] = datetime.datetime.now()

        # 1. CUSTO TOTAL DO PERÍODO
        cost_pipeline = []
        if date_match:
            cost_pipeline.append({"$match": {"createdAt": date_match}})

        cost_pipeline.extend([{"$group": {"_id": None, "totalCost": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}}}}])

        cost_result = aggregate_transactions(cost_pipeline)
        total_cost = round(cost_result[0]["totalCost"], 4) if cost_result else 0.0

        # 1b. CUSTO DO MEMORYRUN (context: memory)
        memory_cost_pipeline = []
        memory_match: dict = {"context": "memory"}
        if date_match:
            memory_match["createdAt"] = date_match
        memory_cost_pipeline.append({"$match": memory_match})
        memory_cost_pipeline.extend(
            [{"$group": {"_id": None, "memoryCost": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}}}}]
        )
        memory_cost_result = aggregate_transactions(memory_cost_pipeline)
        memory_cost = round(memory_cost_result[0]["memoryCost"], 4) if memory_cost_result else 0.0

        # 2. USUÁRIOS NOVOS NO PERÍODO (criados na collection users)
        user_pipeline = []
        if date_match:
            user_pipeline.append({"$match": {"createdAt": date_match}})

        user_pipeline.extend([{"$count": "newUsers"}])

        new_users_result = aggregate_users(user_pipeline)
        new_users = new_users_result[0]["newUsers"] if new_users_result else 0

        # 3. CONTAS ATIVAS (todos os usuários cadastrados no sistema)
        active_pipeline = [{"$count": "name"}]

        active_result = aggregate_users(active_pipeline)
        active_accounts = active_result[0]["name"] if active_result else 0

        # if DEBUG_REPORTS:
        #     print(f"[DEBUG] KPIs calculados: {active_accounts}")

        result = {
            "totalCost": total_cost,
            "memoryCost": memory_cost,
            "newUsers": new_users,
            "activeAccounts": active_accounts,
        }

        if DEBUG_REPORTS:
            print(f"[DEBUG] KPIs calculados: {result}")

        return result

    except Exception as e:
        print(f"[DEBUG] Erro ao calcular KPIs: {e}")
        return {"totalCost": 0.0, "memoryCost": 0.0, "newUsers": 0, "activeAccounts": 0}


# USER EFFICIENCY - COST PER MESSAGE
@app.get("/reports/user-efficiency")
async def get_user_efficiency(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get user efficiency data (cost per message ratio).
    Returns: [{ username: 'rm810774', name: 'Rafael Da Silva Melo', Volume: 100, Custo: 15.50, CostPerMessage: 0.155 }]
    FIXED: Now counts only user messages (tokenType: 'prompt') for volume to match real conversations.
    """
    # Se limit for None, não aplicamos limit (busca todos)
    if limit is not None:
        limit = int(limit)

    try:
        pipeline = []
        match = {}

        print(f"[DEBUG] User Efficiency - user: {user}, start_date: {start_date}, end_date: {end_date}")

        # Filtro por usuário específico
        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                print("Usuário não encontrado")
                return []
            match["user"] = user_data["_id"]
            if DEBUG_REPORTS:
                print(f"[DEBUG] Filtrando por usuário: {user_data['username']}")

        # Filtro por período
        if start_date or end_date:
            match["createdAt"] = {}
            if start_date:
                match["createdAt"]["$gte"] = datetime.datetime.strptime(start_date, "%Y-%m-%d")
            if end_date:
                end_datetime = datetime.datetime.strptime(end_date, "%Y-%m-%d")
                end_datetime = end_datetime.replace(hour=23, minute=59, second=59)
                match["createdAt"]["$lte"] = end_datetime
            if not match["createdAt"]:
                del match["createdAt"]
        else:
            # Últimos 30 dias se não especificar período
            match["createdAt"] = {}
            match["createdAt"]["$gte"] = datetime.datetime.now() - datetime.timedelta(days=30)
            match["createdAt"]["$lte"] = datetime.datetime.now()

        if match:
            pipeline.append({"$match": match})

        # Agrupa por usuário e calcula eficiência
        pipeline.extend(
            [
                {
                    "$group": {
                        "_id": "$user",
                        # Volume: conta apenas mensagens de usuário (prompt)
                        "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                        # Custo: soma TODOS os tipos de token (prompt + completion)
                        "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                    }
                },
                {
                    "$match": {
                        "Volume": {"$gt": 0},  # Só usuários com mensagens
                        "Custo": {"$gt": 0},  # Só usuários com custo > 0
                    }
                },
                {"$addFields": {"CostPerMessage": {"$divide": ["$Custo", "$Volume"]}}},
                {"$lookup": {"from": "users", "localField": "_id", "foreignField": "_id", "as": "user_info"}},
                {"$unwind": "$user_info"},
                {
                    "$project": {
                        "_id": 0,
                        "name": "$user_info.name",
                        "username": "$user_info.username",
                        "costCenter": "$user_info.costCenterCode",
                        "Volume": 1,
                        "Custo": {"$round": ["$Custo", 4]},
                        "CostPerMessage": {"$round": ["$CostPerMessage", 4]},
                    }
                },
                {
                    "$sort": {"CostPerMessage": -1}  # Ordena por maior custo por mensagem
                },
            ]
        )

        # Aplica limit só se foi especificado
        if limit is not None:
            pipeline.append({"$limit": limit})

        if DEBUG_REPORTS:
            print(f"[DEBUG] User Efficiency Pipeline: {pipeline}")

        result = aggregate_transactions(pipeline)

        if DEBUG_REPORTS:
            print(f"[DEBUG] User Efficiency Result: {result}")

        return result

    except Exception as e:
        print(f"[DEBUG] Erro ao calcular eficiência de usuários: {e}")
        return []


# -------------------------------------------------------------------------
# COST CENTER REPORTS - NEW FUNCTIONALITY
# -------------------------------------------------------------------------


# TOP COST CENTERS BY MESSAGE VOLUME
# RETURNS: [{ name: 'CC001', Volume: 12450, Custo: 145.80 }]
@app.get("/reports/top-cost-centers-volume")
async def get_top_cost_centers_volume(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get top cost centers by message volume.
    Groups transactions by cost center and counts user messages (tokenType: 'prompt').
    """
    try:
        if limit is not None:
            limit = int(limit)

        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        pipeline.append({"$match": match})

        pipeline.extend(
        [
            # Lookup para buscar dados do usuário (incluindo centro de custo)
            {"$lookup": {"from": "users", "localField": "user", "foreignField": "_id", "as": "user_info"}},
            {"$unwind": "$user_info"},
            # Agrupa por centro de custo (usando costCenterName para melhor visualização)
            {
                "$group": {
                    "_id": "$user_info.costCenterName",
                    # Volume: conta apenas mensagens de usuário (prompt)
                    "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                    # Custo: soma TODOS os tipos de token (prompt + completion)
                    "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                    # Mantém o código para referência
                    "costCenterCode": {"$first": "$user_info.costCenterCode"},
                }
            },
            # Filtra apenas centros de custo válidos (não nulos/vazios)
            {"$match": {"_id": {"$ne": None, "$ne": "", "$exists": True}}},
            {
                "$project": {
                    "_id": 0,
                    "name": "$_id",  # Nome do centro de custo
                    "code": "$costCenterCode",  # Código do centro de custo
                    "Volume": 1,
                    "Custo": {"$round": ["$Custo", 4]},
                    "value": "$Volume",  # Para compatibilidade com gráficos radiais
                }
            },
            {"$sort": {"Volume": -1}},
        ]
    )

        if limit is not None:
            pipeline.append({"$limit": limit})

        return aggregate_transactions(pipeline)
    except Exception as exc:
        print(f"[reports] Erro em top-cost-centers-volume: {exc}")
        return []


# TOP COST CENTERS BY COST
# RETURNS: [{ name: 'CC001', Volume: 12450, Custo: 145.80 }]
@app.get("/reports/top-cost-centers-cost")
async def get_top_cost_centers_cost(
    user: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search_by: str = "username",
    limit: int | None = None,
):
    """
    Get top cost centers by cost.
    Groups transactions by cost center and calculates total cost.
    """
    try:
        if limit is not None:
            limit = int(limit)

        pipeline = []
        match: dict = {"createdAt": build_created_at_match(start_date, end_date)}

        if user:
            user_data = get_user_data(user, search_by)
            if not user_data or isinstance(user_data, str):
                return []
            match["user"] = user_data["_id"]

        pipeline.append({"$match": match})

        pipeline.extend(
        [
            # Lookup para buscar dados do usuário (incluindo centro de custo)
            {"$lookup": {"from": "users", "localField": "user", "foreignField": "_id", "as": "user_info"}},
            {"$unwind": "$user_info"},
            # Agrupa por centro de custo (usando costCenterName para melhor visualização)
            {
                "$group": {
                    "_id": "$user_info.costCenterName",
                    # Volume: conta apenas mensagens de usuário (prompt)
                    "Volume": {"$sum": {"$cond": [{"$eq": ["$tokenType", "prompt"]}, 1, 0]}},
                    # Custo: soma TODOS os tipos de token (prompt + completion)
                    "Custo": {"$sum": {"$divide": ["$tokenValue", -1_000_000]}},
                    # Mantém o código para referência
                    "costCenterCode": {"$first": "$user_info.costCenterCode"},
                }
            },
            # Filtra apenas centros de custo válidos (não nulos/vazios)
            {"$match": {"_id": {"$ne": None, "$ne": "", "$exists": True}}},
            {
                "$project": {
                    "_id": 0,
                    "name": "$_id",  # Nome do centro de custo
                    "code": "$costCenterCode",  # Código do centro de custo
                    "Volume": 1,
                    "Custo": {"$round": ["$Custo", 4]},
                    "value": "$Volume",  # Para compatibilidade com gráficos radiais
                }
            },
            {
                "$sort": {"Custo": -1}  # Ordena por custo (maior para menor)
            },
        ]
    )

        if limit is not None:
            pipeline.append({"$limit": limit})

        return aggregate_transactions(pipeline)
    except Exception as exc:
        print(f"[reports] Erro em top-cost-centers-cost: {exc}")
        return []


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=15785)
