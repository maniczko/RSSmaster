from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.config import Settings, get_settings

from .models import (
    AnnotationHubModel,
    AnnotationHubResponse,
    AnnotationListPageModel,
    AnnotationListResponse,
    AnnotationTimelineEntryModel,
    CreateDocumentNoteRequest,
    CreateHighlightNoteRequest,
    CreateHighlightRequest,
    DocumentNoteListResponse,
    DocumentNoteModel,
    DocumentNoteResponse,
    HighlightListResponse,
    HighlightModel,
    HighlightNoteListResponse,
    HighlightNoteModel,
    HighlightNoteResponse,
    HighlightResponse,
)
from .repository import AnnotationRepository
from .service import AnnotationService

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])


def get_annotation_service(settings: Settings = Depends(get_settings)) -> AnnotationService:
    repository = AnnotationRepository(settings.database_file)
    return AnnotationService(repository)


@router.get("", response_model=AnnotationListResponse)
def list_annotations(
    *,
    item_id: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: AnnotationService = Depends(get_annotation_service),
) -> AnnotationListResponse:
    result = service.list_annotations(
        item_id=item_id,
        kind=kind,
        search=search,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return AnnotationListResponse(
        items=[AnnotationTimelineEntryModel.model_validate(item) for item in result.items],
        page=AnnotationListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/hub", response_model=AnnotationHubResponse)
def get_annotation_hub(
    *,
    item_id: str = Query(...),
    service: AnnotationService = Depends(get_annotation_service),
) -> AnnotationHubResponse:
    hub = service.get_annotation_hub(item_id)
    return AnnotationHubResponse(hub=AnnotationHubModel.model_validate(hub))


@router.post("/highlights", response_model=HighlightResponse, status_code=status.HTTP_201_CREATED)
def create_highlight(
    payload: CreateHighlightRequest,
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightResponse:
    highlight = service.create_highlight(payload)
    return HighlightResponse(highlight=HighlightModel.model_validate(highlight))


@router.get("/highlights", response_model=HighlightListResponse)
def list_highlights(
    *,
    item_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightListResponse:
    result = service.list_highlights(
        item_id=item_id,
        search=search,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return HighlightListResponse(
        items=[HighlightModel.model_validate(item) for item in result.items],
        page=AnnotationListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/highlights/{highlight_id}", response_model=HighlightResponse)
def get_highlight(
    highlight_id: str,
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightResponse:
    highlight = service.get_highlight(highlight_id)
    return HighlightResponse(highlight=HighlightModel.model_validate(highlight))


@router.post("/highlights/{highlight_id}/notes", response_model=HighlightNoteResponse, status_code=status.HTTP_201_CREATED)
def create_highlight_note(
    highlight_id: str,
    payload: CreateHighlightNoteRequest,
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightNoteResponse:
    note = service.create_highlight_note(highlight_id, payload)
    return HighlightNoteResponse(note=HighlightNoteModel.model_validate(note))


@router.get("/highlights/{highlight_id}/notes", response_model=HighlightNoteListResponse)
def list_highlight_notes_for_highlight(
    highlight_id: str,
    *,
    search: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightNoteListResponse:
    result = service.list_highlight_notes(
        item_id=None,
        highlight_id=highlight_id,
        search=search,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return HighlightNoteListResponse(
        items=[HighlightNoteModel.model_validate(item) for item in result.items],
        page=AnnotationListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/highlight-notes", response_model=HighlightNoteListResponse)
def list_highlight_notes(
    *,
    item_id: str | None = Query(default=None),
    highlight_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightNoteListResponse:
    result = service.list_highlight_notes(
        item_id=item_id,
        highlight_id=highlight_id,
        search=search,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return HighlightNoteListResponse(
        items=[HighlightNoteModel.model_validate(item) for item in result.items],
        page=AnnotationListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/highlight-notes/{note_id}", response_model=HighlightNoteResponse)
def get_highlight_note(
    note_id: str,
    service: AnnotationService = Depends(get_annotation_service),
) -> HighlightNoteResponse:
    note = service.get_highlight_note(note_id)
    return HighlightNoteResponse(note=HighlightNoteModel.model_validate(note))


@router.post("/document-notes", response_model=DocumentNoteResponse, status_code=status.HTTP_201_CREATED)
def create_document_note(
    payload: CreateDocumentNoteRequest,
    service: AnnotationService = Depends(get_annotation_service),
) -> DocumentNoteResponse:
    note = service.create_document_note(payload)
    return DocumentNoteResponse(note=DocumentNoteModel.model_validate(note))


@router.get("/document-notes", response_model=DocumentNoteListResponse)
def list_document_notes(
    *,
    item_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: AnnotationService = Depends(get_annotation_service),
) -> DocumentNoteListResponse:
    result = service.list_document_notes(
        item_id=item_id,
        search=search,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return DocumentNoteListResponse(
        items=[DocumentNoteModel.model_validate(item) for item in result.items],
        page=AnnotationListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/document-notes/{note_id}", response_model=DocumentNoteResponse)
def get_document_note(
    note_id: str,
    service: AnnotationService = Depends(get_annotation_service),
) -> DocumentNoteResponse:
    note = service.get_document_note(note_id)
    return DocumentNoteResponse(note=DocumentNoteModel.model_validate(note))
