from decimal import Decimal

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
from apps.storefronts.models import Product, Storefront
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


class ProductIn(Schema):
    storefront_id: int
    description: str
    unit: str
    minimum: Decimal
    topup_hours: int


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
    send_email_code(payload.email)
    return {"ok": True}


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


@router.get("/storefronts", auth=None)
def list_storefronts(request):
    rows = Storefront.objects.all().order_by("id")
    return [{"id": row.pk, "name": row.name, "owner_id": row.owner_id} for row in rows]


@router.post("/storefronts", auth=auth)
def create_storefront(request, payload: StorefrontIn):
    if Storefront.objects.filter(owner=request.auth).exists():
        raise OrderError(409, "витрина уже есть")
    if not payload.name.strip():
        raise OrderError(400, "нужно название")
    row = Storefront.objects.create(owner=request.auth, name=payload.name.strip())
    return {"id": row.pk, "name": row.name}


@router.get("/storefronts/{storefront_id}", auth=None)
def storefront_detail(request, storefront_id: int):
    row = get_object_or_404(Storefront, pk=storefront_id)
    products = [
        {"id": product.pk, "description": product.description, "unit": product.unit}
        for product in row.products.all()
    ]
    return {"id": row.pk, "name": row.name, "products": products}


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
        {"id": link.district_id, "name": link.district.name}
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
        "districts": districts,
        "progress": progress(order, product),
    }


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
