from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from apps.delivery.models import DistrictNotice, ProductDistrict
from apps.orders.errors import OrderError
from apps.orders.models import GroupOrder, OrderLine
from apps.storefronts.models import Product

OPEN = (GroupOrder.COLLECTING, GroupOrder.TOPUP)


def dec(value):
    if value is None:
        return None
    return str(value)


def buyer_count(order: GroupOrder) -> int:
    return order.lines.aggregate(n=Count("buyer", distinct=True))["n"] or 0


def progress(order: GroupOrder | None, product: Product) -> dict:
    if order is None or order.status == GroupOrder.CLOSED:
        return {
            "order_id": None,
            "status": None,
            "buyers": None,
            "quantity": None,
            "minimum": None,
            "remaining": None,
            "cancel_blocked": None,
            "topup_ends_at": None,
        }
    minimum = order.minimum_snapshot if order.minimum_snapshot is not None else product.minimum
    remaining = None
    if order.status == GroupOrder.COLLECTING:
        gap = minimum - order.quantity
        remaining = gap if gap > 0 else Decimal("0")
    return {
        "order_id": order.pk,
        "status": order.status,
        "buyers": buyer_count(order),
        "quantity": dec(order.quantity),
        "minimum": dec(minimum),
        "remaining": dec(remaining),
        "cancel_blocked": order.status != GroupOrder.COLLECTING,
        "topup_ends_at": order.topup_ends_at,
    }


def close_expired(product: Product, now=None) -> None:
    now = now or timezone.now()
    GroupOrder.objects.filter(
        product=product,
        status=GroupOrder.TOPUP,
        topup_ends_at__lte=now,
    ).update(status=GroupOrder.CLOSED)


def open_order(product: Product) -> GroupOrder | None:
    return GroupOrder.objects.filter(product=product, status__in=OPEN).first()


def product_editable(product: Product) -> bool:
    order = open_order(product)
    return order is None or order.status == GroupOrder.COLLECTING


def _promote(order: GroupOrder, product: Product, now) -> None:
    order.status = GroupOrder.TOPUP
    order.minimum_reached_at = now
    order.topup_ends_at = now + timedelta(hours=product.topup_hours)
    order.minimum_snapshot = product.minimum
    order.unit_snapshot = product.unit
    order.save()
    text = (
        "Минимум набран, рейс состоится. "
        f"Дозаказать можно до {order.topup_ends_at.isoformat()}. "
        "Эту партию привезут быстрее следующего сбора."
    )
    district_ids = ProductDistrict.objects.filter(product=product).values_list("district_id", flat=True)
    DistrictNotice.objects.bulk_create(
        [DistrictNotice(district_id=district_id, order=order, text=text) for district_id in district_ids]
    )


def _lock_open(product: Product, now) -> GroupOrder:
    order = (
        GroupOrder.objects.select_for_update()
        .filter(product=product, status__in=OPEN)
        .first()
    )
    if order is not None and order.status == GroupOrder.TOPUP and order.topup_ends_at and order.topup_ends_at <= now:
        order.status = GroupOrder.CLOSED
        order.save(update_fields=["status"])
        order = None
    if order is None:
        order = GroupOrder.objects.create(product=product, status=GroupOrder.COLLECTING, quantity=0)
        order = GroupOrder.objects.select_for_update().get(pk=order.pk)
    return order


@transaction.atomic
def add_line(product: Product, buyer, quantity: Decimal, district_id: int, address: str) -> dict:
    now = timezone.now()
    product = Product.objects.select_for_update().get(pk=product.pk)
    if quantity <= 0:
        raise OrderError(400, "количество должно быть больше нуля")
    if not address.strip():
        raise OrderError(400, "нужен адрес точки")
    if not product.description.strip() or not product.photos.exists():
        raise OrderError(400, "у товара нужны описание и хотя бы одно фото")
    if not ProductDistrict.objects.filter(product=product, district_id=district_id).exists():
        raise OrderError(400, "район не входит в доставку этого товара")
    order = _lock_open(product, now)
    if order.status == GroupOrder.TOPUP and order.topup_ends_at and order.topup_ends_at <= now:
        raise OrderError(409, "окно дозаказа закрыто")
    OrderLine.objects.create(
        order=order,
        buyer=buyer,
        quantity=quantity,
        district_id=district_id,
        address=address.strip(),
    )
    order.quantity += quantity
    if order.status == GroupOrder.COLLECTING and order.quantity >= product.minimum:
        _promote(order, product, now)
    else:
        order.save(update_fields=["quantity"])
    return progress(order, product)


@transaction.atomic
def cancel_line(line: OrderLine, buyer) -> None:
    if line.buyer_id != buyer.pk:
        raise OrderError(403, "чужая заявка")
    now = timezone.now()
    order = GroupOrder.objects.select_for_update().get(pk=line.order_id)
    if order.status == GroupOrder.TOPUP and order.topup_ends_at and order.topup_ends_at <= now:
        order.status = GroupOrder.CLOSED
        order.save(update_fields=["status"])
    if order.status != GroupOrder.COLLECTING:
        raise OrderError(409, "отмена закрыта")
    order.quantity -= line.quantity
    line.delete()
    order.save(update_fields=["quantity"])


@transaction.atomic
def apply_minimum(product: Product, minimum: Decimal) -> None:
    now = timezone.now()
    product = Product.objects.select_for_update().get(pk=product.pk)
    if not product_editable(product):
        raise OrderError(409, "товар сейчас в окне дозаказа")
    if minimum <= 0:
        raise OrderError(400, "минимум должен быть больше нуля")
    product.minimum = minimum
    product.save(update_fields=["minimum"])
    order = GroupOrder.objects.select_for_update().filter(product=product, status=GroupOrder.COLLECTING).first()
    if order is not None and order.quantity >= product.minimum:
        _promote(order, product, now)
