import json
import math
import urllib.parse
import urllib.request
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, NinjaAPI, Router, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.accounts.models import User
from apps.delivery.models import District, DistrictNotice, ProductDistrict
from apps.orders.errors import OrderError
from apps.orders.models import GroupOrder, OrderLine
from apps.orders.services import (
    add_line,
    apply_minimum,
    cancel_line,
    close_expired,
    open_order,
    product_editable,
    progress,
)
from apps.storefronts.models import STOREFRONT_TITLES, Product, Storefront
from apps.accounts.login_flows import send_email_code, verify_email_code, vk_finish, vk_start
from config.jwt_auth import JWTAuth, issue_token
from media_storage import save_product_photo

api = NinjaAPI(urls_namespace="potok")
auth = JWTAuth()
router = Router()


@api.exception_handler(OrderError)
def order_error(request, exc: OrderError):
    return api.create_response(request, {"detail": exc.message}, status=exc.status)


class RegisterIn(Schema):
    password: str
    email: str = ""
    phone: str = ""


class TokenIn(Schema):
    login: str
    password: str


class TokenOut(Schema):
    token: str


class StorefrontIn(Schema):
    name: str
    title: str = "лавка"
    address: str = ""
    pickup: bool = False
    services: list[str] = []


class StorefrontPatch(Schema):
    address: str | None = None
    pickup: bool | None = None
    services: list[str] | None = None
    latitude: float | None = None
    longitude: float | None = None
    area: list | None = None


class ProductIn(Schema):
    storefront_id: int
    description: str
    unit: str
    minimum: Decimal
    topup_hours: int
    price: Decimal | None = None


class ProductPatch(Schema):
    description: str | None = None
    minimum: Decimal | None = None
    topup_hours: int | None = None


class DistrictsIn(Schema):
    names: list[str]


class LineIn(Schema):
    quantity: Decimal
    district_id: int
    address: str


def _ring(lat: float, lon: float, km: float = 50, count: int = 8) -> list[list[float]]:
    points = []
    for index in range(count):
        bearing = math.radians(index * (360 / count))
        dlat = (km / 111.32) * math.cos(bearing)
        dlon = (km / (111.32 * math.cos(math.radians(lat)))) * math.sin(bearing)
        points.append([round(lat + dlat, 6), round(lon + dlon, 6)])
    return points


def _yandex_members(text: str, limit: int) -> list[dict]:
    key = settings.YANDEX_GEOCODER_API_KEY
    if not key:
        return []
    query = urllib.parse.urlencode({"apikey": key, "geocode": text, "format": "json", "lang": "ru_RU", "results": limit})
    request = urllib.request.Request(
        f"https://geocode-maps.yandex.ru/1.x/?{query}",
        headers={"User-Agent": "potok/1.0 (programism.ru)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            payload = json.loads(response.read().decode())
    except Exception:
        return []
    return payload.get("response", {}).get("GeoObjectCollection", {}).get("featureMember") or []


def _geocode(address: str) -> tuple[float, float] | None:
    members = _yandex_members(address, 1)
    if members:
        pos = members[0].get("GeoObject", {}).get("Point", {}).get("pos", "")
        lon, _, lat = pos.partition(" ")
        if lat and lon:
            return float(lat), float(lon)
    query = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1})
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{query}",
        headers={"User-Agent": "potok/1.0 (programism.ru)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            rows = json.loads(response.read().decode())
    except Exception:
        return None
    if not rows:
        return None
    return float(rows[0]["lat"]), float(rows[0]["lon"])


def _place(row: Storefront) -> dict:
    return {
        "id": row.pk,
        "name": row.name,
        "title": row.title,
        "owner_id": row.owner_id,
        "address": row.address,
        "pickup": row.pickup,
        "services": row.services or [],
        "latitude": row.latitude,
        "longitude": row.longitude,
        "area": row.area or [],
    }


def _login_of(email: str, phone: str) -> str:
    email = email.strip().lower()
    phone = phone.strip()
    if bool(email) == bool(phone):
        raise OrderError(400, "укажите телефон или email")
    return email or phone


def _photo_url(request: HttpRequest, photo) -> str:
    return request.build_absolute_uri(photo.image.url)


def _require_owner(product: Product, user: User) -> None:
    if product.storefront.owner_id != user.pk:
        raise OrderError(403, "чужой товар")


def _ensure_editable(product: Product) -> None:
    close_expired(product)
    if not product_editable(product):
        raise OrderError(409, "товар сейчас в окне дозаказа")


@router.post("/auth/register", auth=None, response=TokenOut)
def register(request, payload: RegisterIn):
    login = _login_of(payload.email, payload.phone)
    if User.objects.filter(login=login).exists():
        raise OrderError(400, "такой пользователь уже есть")
    if len(payload.password) < 8:
        raise OrderError(400, "пароль короче 8 символов")
    user = User.objects.create_user(
        login,
        payload.password,
        email=payload.email.strip().lower(),
        phone=payload.phone.strip(),
    )
    return {"token": issue_token(user)}


class EmailIn(Schema):
    email: str


class EmailCodeIn(Schema):
    email: str
    code: str


class VkFinishIn(Schema):
    code: str
    device_id: str = ""
    verifier: str
    state: str


@router.post("/auth/email/send", auth=None)
def email_send(request, payload: EmailIn):
    code = send_email_code(payload.email)
    body = {"ok": True}
    host = request.get_host().split(":")[0]
    if code and host in {"127.0.0.1", "localhost"}:
        body["code"] = code
    return body


@router.post("/auth/email/verify", auth=None, response=TokenOut)
def email_verify(request, payload: EmailCodeIn):
    return {"token": issue_token(verify_email_code(payload.email, payload.code))}


@router.get("/auth/vk/start", auth=None)
def vk_begin(request):
    return vk_start()


@router.post("/auth/vk/finish", auth=None, response=TokenOut)
def vk_complete(request, payload: VkFinishIn):
    user = vk_finish(payload.code, payload.device_id, payload.verifier, payload.state)
    return {"token": issue_token(user)}


@router.post("/auth/token", auth=None, response=TokenOut)
def token(request, payload: TokenIn):
    user = User.objects.filter(login=payload.login.strip().lower()).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "неверный логин или пароль")
    return {"token": issue_token(user)}


def _short_address(line: str) -> str:
    line = line.replace("муниципальный округ", "м.о.").replace("городской округ", "г.о.")
    kept = []
    for part in (item.strip() for item in line.split(",")):
        if not part:
            continue
        low = part.lower()
        if low in {"россия", "russia"} or "федеральный округ" in low:
            continue
        if part.isdigit() and len(part) == 6:
            continue
        district = part
        for prefix in ("м.о. ", "г.о. "):
            if low.startswith(prefix):
                district = part[len(prefix):].strip()
                break
        names = {item.lower() for item in kept}
        if district.lower() in names and district != part:
            continue
        if part not in kept:
            kept.append(part)
    return ", ".join(kept)


def _suggest_yandex(text: str) -> list[str]:
    rows = []
    for item in _yandex_members(text, 6):
        geo = item.get("GeoObject") or {}
        meta = (geo.get("metaDataProperty") or {}).get("GeocoderMetaData") or {}
        line = _short_address(meta.get("text") or geo.get("name") or "")
        if line and line not in rows:
            rows.append(line)
    return rows


def _suggest_places(text: str) -> list[str]:
    query = urllib.parse.urlencode({
        "q": text,
        "format": "json",
        "addressdetails": 1,
        "limit": 6,
        "countrycodes": "ru",
    })
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{query}",
        headers={"User-Agent": "potok/1.0 (programism.ru)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = json.loads(response.read().decode())
    except Exception:
        return []
    rows = []
    for item in payload:
        line = _short_address(item.get("display_name") or "")
        if line and line not in rows:
            rows.append(line)
    return rows


@router.get("/maps", auth=None)
def maps_config(request):
    return {"yandex_key": settings.YANDEX_MAPS_API_KEY}


@router.get("/geo/suggest", auth=None)
def geo_suggest(request, q: str = ""):
    text = q.strip()
    if len(text) < 2:
        return []
    rows = _suggest_yandex(text)
    return rows or _suggest_places(text)


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    hav = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(hav))


def _locality(lat: float, lon: float) -> str:
    members = _yandex_members(f"{lon},{lat}", 1)
    if members:
        meta = ((members[0].get("GeoObject") or {}).get("metaDataProperty") or {}).get("GeocoderMetaData") or {}
        components = (meta.get("Address") or {}).get("Components") or []
        for kind in ("locality", "district", "province"):
            for part in components:
                if part.get("kind") == kind and part.get("name"):
                    return part["name"]
    query = urllib.parse.urlencode({"lat": lat, "lon": lon, "format": "json", "zoom": 16, "addressdetails": 1})
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{query}",
        headers={"User-Agent": "potok/1.0 (programism.ru)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            address = json.loads(response.read().decode()).get("address") or {}
    except Exception:
        return ""
    for key in ("village", "town", "city", "hamlet", "municipality", "county"):
        name = (address.get(key) or "").strip()
        if not name:
            continue
        for prefix in ("муниципальный округ ", "городской округ "):
            if name.lower().startswith(prefix):
                name = name[len(prefix):].strip()
        return name
    return ""


@router.get("/geo/place", auth=None)
def geo_place(request, q: str = ""):
    text = q.strip()
    if len(text) < 2:
        raise OrderError(400, "напишите населённый пункт")
    members = _yandex_members(text, 1)
    if members:
        geo = members[0].get("GeoObject") or {}
        pos = (geo.get("Point") or {}).get("pos", "")
        lon, _, lat = pos.partition(" ")
        meta = (geo.get("metaDataProperty") or {}).get("GeocoderMetaData") or {}
        if lat and lon:
            return {
                "label": _short_address(meta.get("text") or geo.get("name") or text),
                "lat": float(lat),
                "lon": float(lon),
            }
    point = _geocode(text)
    if point is None:
        raise OrderError(404, "населённый пункт не найден")
    return {"label": text, "lat": point[0], "lon": point[1]}


@router.get("/geo/here", auth=None)
def geo_here(request, lat: float, lon: float):
    return {"label": _locality(lat, lon)}


def _about(row: Storefront) -> str:
    goods = []
    for product in row.products.all()[:3]:
        line = (product.description or "").split(".")[0].strip()
        if line:
            goods.append(line)
    offers = [offer.name for offer in row.offers.all()[:2]]
    parts = []
    if goods:
        parts.append("В сборе: " + ", ".join(goods) + ".")
    if offers:
        parts.append("На месте: " + ", ".join(offers) + ".")
    if row.pickup:
        parts.append("Можно забрать самим.")
    return " ".join(parts)


def _cover(request, row: Storefront) -> str:
    shot = row.gallery.first()
    if shot and shot.image:
        return request.build_absolute_uri(shot.image.url)
    product = row.products.prefetch_related("photos").first()
    photo = product.photos.first() if product else None
    if photo and photo.image:
        return request.build_absolute_uri(photo.image.url)
    return ""


@router.get("/storefronts/nearby", auth=None)
def nearby_storefronts(request, lat: float = 0, lon: float = 0, km: float = 80, all: int = 0):
    found = []
    has_point = lat != 0 or lon != 0
    for row in Storefront.objects.all():
        if row.latitude is None or row.longitude is None:
            point = _geocode(row.address) if row.address else None
            if point:
                row.latitude, row.longitude = point
                row.save(update_fields=["latitude", "longitude"])
        place = _place(row)
        place["cover"] = _cover(request, row)
        place["about"] = _about(row)
        if has_point and row.latitude is not None and row.longitude is not None:
            distance = _km(lat, lon, row.latitude, row.longitude)
            if not all and distance > km:
                continue
            place["km"] = round(distance, 1)
        else:
            if not all:
                continue
            place["km"] = None
        found.append(place)
    found.sort(key=lambda item: (item["km"] is None, item["km"] if item["km"] is not None else 0))
    return found


@router.get("/storefronts", auth=None)
def list_storefronts(request):
    rows = Storefront.objects.all().order_by("id")
    return [_place(row) for row in rows]


@router.post("/storefronts", auth=auth)
def create_storefront(request, payload: StorefrontIn):
    if Storefront.objects.filter(owner=request.auth).exists():
        raise OrderError(409, "уже создано")
    if not payload.name.strip():
        raise OrderError(400, "нужно название")
    title = payload.title.strip().lower()
    if title not in STOREFRONT_TITLES:
        raise OrderError(400, "выберите: витрина, лавка, магазин, прилавок или бутик")
    address = payload.address.strip()
    services = [item.strip() for item in payload.services if item.strip()][:12]
    lat = lon = None
    area: list = []
    if address:
        found = _geocode(address)
        if found:
            lat, lon = found
            area = _ring(lat, lon)
    row = Storefront.objects.create(
        owner=request.auth,
        name=payload.name.strip(),
        title=title,
        address=address,
        pickup=payload.pickup,
        services=services,
        latitude=lat,
        longitude=lon,
        area=area,
    )
    return _place(row)


@router.patch("/storefronts/{storefront_id}", auth=auth)
def patch_storefront(request, storefront_id: int, payload: StorefrontPatch):
    row = get_object_or_404(Storefront, pk=storefront_id, owner=request.auth)
    data = payload.model_dump(exclude_unset=True)
    if "address" in data:
        row.address = (data["address"] or "").strip()
        if row.address and row.latitude is None:
            found = _geocode(row.address)
            if found:
                row.latitude, row.longitude = found
                if not row.area:
                    row.area = _ring(row.latitude, row.longitude)
    if "pickup" in data:
        row.pickup = bool(data["pickup"])
    if "services" in data:
        row.services = [str(item).strip() for item in data["services"] if str(item).strip()][:12]
    if "latitude" in data and "longitude" in data and data["latitude"] is not None and data["longitude"] is not None:
        row.latitude = float(data["latitude"])
        row.longitude = float(data["longitude"])
        if not row.area:
            row.area = _ring(row.latitude, row.longitude)
    if "area" in data and data["area"] is not None:
        points = data["area"]
        if not isinstance(points, list) or len(points) > 300:
            raise OrderError(400, "слишком много точек")
        clean = []
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise OrderError(400, "точка должна быть парой координат")
            clean.append([round(float(point[0]), 6), round(float(point[1]), 6)])
        row.area = clean
    row.save()
    return _place(row)


@router.get("/storefronts/{storefront_id}", auth=None)
def storefront_detail(request, storefront_id: int):
    row = get_object_or_404(Storefront, pk=storefront_id)
    products = []
    for product in row.products.prefetch_related("photos", "product_districts__district"):
        close_expired(product)
        photo = product.photos.first()
        state = progress(open_order(product), product)
        products.append(
            {
                "id": product.pk,
                "description": product.description,
                "unit": product.unit,
                "minimum": str(product.minimum),
                "topup_hours": product.topup_hours,
                "districts": [link.district.name for link in product.product_districts.all()],
                "photo": _photo_url(request, photo) if photo else "",
                "price": str(product.price) if product.price is not None else "",
                "status": state["status"],
                "quantity": state["quantity"],
                "buyers": state["buyers"],
                "remaining": state["remaining"],
            }
        )
    place = _place(row)
    place["products"] = products
    place["offers"] = [
        {
            "name": offer.name,
            "text": offer.text,
            "photo": request.build_absolute_uri(offer.image.url) if offer.image else "",
        }
        for offer in row.offers.all()
    ]
    place["gallery"] = [
        {"photo": request.build_absolute_uri(shot.image.url), "caption": shot.caption}
        for shot in row.gallery.all()
    ]
    return place


@router.post("/products", auth=auth)
def create_product(request, payload: ProductIn):
    storefront = get_object_or_404(Storefront, pk=payload.storefront_id, owner=request.auth)
    if not payload.unit.strip():
        raise OrderError(400, "нужна единица измерения")
    if payload.minimum <= 0 or payload.topup_hours <= 0:
        raise OrderError(400, "минимум и окно X должны быть больше нуля")
    product = Product.objects.create(
        storefront=storefront,
        description=payload.description.strip(),
        unit=payload.unit.strip(),
        minimum=payload.minimum,
        topup_hours=payload.topup_hours,
        price=payload.price,
    )
    return {"id": product.pk}


@router.patch("/products/{product_id}", auth=auth)
@transaction.atomic
def patch_product(request, product_id: int, payload: ProductPatch):
    product = get_object_or_404(Product.objects.select_related("storefront"), pk=product_id)
    _require_owner(product, request.auth)
    _ensure_editable(product)
    if payload.description is not None:
        product.description = payload.description.strip()
        product.save(update_fields=["description"])
    if payload.topup_hours is not None:
        if payload.topup_hours <= 0:
            raise OrderError(400, "окно X должно быть больше нуля")
        product.topup_hours = payload.topup_hours
        product.save(update_fields=["topup_hours"])
    if payload.minimum is not None:
        apply_minimum(product, payload.minimum)
    product.refresh_from_db()
    return {
        "id": product.pk,
        "description": product.description,
        "minimum": str(product.minimum),
        "topup_hours": product.topup_hours,
        "unit": product.unit,
    }


@router.post("/products/{product_id}/photos", auth=auth)
def upload_photo(request, product_id: int, file: File[UploadedFile]):
    product = get_object_or_404(Product.objects.select_related("storefront"), pk=product_id)
    _require_owner(product, request.auth)
    _ensure_editable(product)
    photo = save_product_photo(product, file)
    return {"id": photo.pk, "url": _photo_url(request, photo)}


@router.put("/products/{product_id}/districts", auth=auth)
@transaction.atomic
def put_districts(request, product_id: int, payload: DistrictsIn):
    product = get_object_or_404(
        Product.objects.select_for_update().select_related("storefront"),
        pk=product_id,
    )
    _require_owner(product, request.auth)
    _ensure_editable(product)
    names = []
    for name in payload.names:
        cleaned = name.strip()
        if cleaned and cleaned not in names:
            names.append(cleaned)
    if not names:
        raise OrderError(400, "нужен хотя бы один район")
    districts = []
    for name in names:
        district, _ = District.objects.get_or_create(storefront=product.storefront, name=name)
        districts.append(district)
    keep_ids = {district.pk for district in districts}
    order = open_order(product)
    if order is not None and order.status == GroupOrder.COLLECTING:
        used = set(order.lines.values_list("district_id", flat=True))
        current = set(product.product_districts.values_list("district_id", flat=True))
        if used & (current - keep_ids):
            raise OrderError(409, "район со заявкой текущего сбора снять нельзя")
    product.product_districts.exclude(district_id__in=keep_ids).delete()
    for district in districts:
        ProductDistrict.objects.get_or_create(product=product, district=district)
    return [{"id": district.pk, "name": district.name} for district in districts]


@router.get("/products/{product_id}", auth=None)
def product_detail(request, product_id: int):
    product = get_object_or_404(Product.objects.select_related("storefront"), pk=product_id)
    close_expired(product)
    order = open_order(product)
    districts = [
        {"id": link.district_id, "name": link.district.name, "polygon": link.district.polygon or []}
        for link in product.product_districts.select_related("district")
    ]
    photos = [{"id": photo.pk, "url": _photo_url(request, photo)} for photo in product.photos.all()]
    return {
        "id": product.pk,
        "storefront_id": product.storefront_id,
        "description": product.description,
        "unit": product.unit,
        "minimum": str(product.minimum),
        "topup_hours": product.topup_hours,
        "photos": photos,
        "price": None if product.price is None else str(product.price),
        "districts": districts,
        "route": product.route or [],
        "owner_id": product.storefront.owner_id,
        "progress": progress(order, product),
    }


def _points(raw: list) -> list:
    points = []
    for item in raw[:300]:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            raise OrderError(400, "точка карты — это широта и долгота")
        lat, lon = float(item[0]), float(item[1])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise OrderError(400, "точка карты вне диапазона")
        points.append([lat, lon])
    return points


class MapIn(Schema):
    district_id: int | None = None
    polygon: list | None = None
    route: list | None = None


@router.put("/products/{product_id}/map", auth=auth)
def save_map(request, product_id: int, payload: MapIn):
    product = get_object_or_404(Product.objects.select_related("storefront"), pk=product_id)
    _require_owner(product, request.auth)
    if payload.polygon is not None:
        if payload.district_id is None:
            raise OrderError(400, "укажите район для контура")
        link = product.product_districts.select_related("district").filter(district_id=payload.district_id).first()
        if link is None:
            raise OrderError(404, "район не привязан к товару")
        link.district.polygon = _points(payload.polygon)
        link.district.save(update_fields=["polygon"])
    if payload.route is not None:
        product.route = _points(payload.route)
        product.save(update_fields=["route"])
    return {"ok": True}


@router.post("/products/{product_id}/lines", auth=auth)
def create_line(request, product_id: int, payload: LineIn):
    product = get_object_or_404(Product, pk=product_id)
    state = add_line(product, request.auth, payload.quantity, payload.district_id, payload.address)
    return state


@router.delete("/lines/{line_id}", auth=auth)
def delete_line(request, line_id: int):
    line = get_object_or_404(OrderLine, pk=line_id)
    cancel_line(line, request.auth)
    return {"ok": True}


@router.get("/me/lines", auth=auth)
def my_lines(request):
    lines = (
        OrderLine.objects.filter(buyer=request.auth)
        .select_related("order__product__storefront")
        .order_by("-id")
    )
    return [
        {
            "id": line.pk,
            "order_id": line.order_id,
            "product_id": line.order.product_id,
            "description": line.order.product.description,
            "farm": line.order.product.storefront.name,
            "quantity": str(line.quantity),
            "unit": line.order.unit_snapshot or line.order.product.unit,
            "status": line.order.status,
            "address": line.address,
        }
        for line in lines
    ]


@router.get("/orders/{order_id}", auth=auth)
def order_detail(request, order_id: int):
    order = get_object_or_404(GroupOrder.objects.select_related("product__storefront"), pk=order_id)
    close_expired(order.product)
    order.refresh_from_db()
    is_owner = order.product.storefront.owner_id == request.auth.pk
    is_buyer = order.lines.filter(buyer=request.auth).exists()
    if not is_owner and not is_buyer:
        raise OrderError(403, "заказ недоступен")
    lines = [
        {
            "id": line.pk,
            "buyer_id": line.buyer_id,
            "quantity": str(line.quantity),
            "district_id": line.district_id,
            "address": line.address,
        }
        for line in order.lines.all()
    ]
    return {
        "id": order.pk,
        "status": order.status,
        "quantity": str(order.quantity),
        "minimum": None if order.minimum_snapshot is None else str(order.minimum_snapshot),
        "unit": order.unit_snapshot,
        "topup_ends_at": order.topup_ends_at,
        "lines": lines,
    }


@router.get("/districts/{district_id}/notices", auth=None)
def notices(request, district_id: int):
    get_object_or_404(District, pk=district_id)
    rows = DistrictNotice.objects.filter(district_id=district_id).order_by("-created_at")
    return [
        {"id": row.pk, "order_id": row.order_id, "text": row.text, "created_at": row.created_at}
        for row in rows
    ]


api.add_router("", router)
