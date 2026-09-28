"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import {
  Camera,
  ImagePlus,
  Link2,
  Plus,
  ScanText,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addRecipePhotos,
  createRecipe,
  deleteRecipePhoto,
  updateRecipe,
} from "@/lib/actions/recipes";
import { nextCelebration } from "@/lib/celebration";
import { describeError, logEvent, networkSnapshot } from "@/lib/client-log";
import { uploadRecipePhotos, type PendingPhoto } from "@/lib/photo-upload";
import { RecipeSavedCelebration } from "@/components/recipe-saved-celebration";
import { PhotoRetryNotice } from "@/components/photo-retry-notice";
import { ExtractFailedNotice } from "@/components/extract-failed-notice";
import { createCategory } from "@/lib/actions/taxonomy";
import {
  createSupabaseBrowserClient,
  publicPhotoUrl,
} from "@/lib/supabase/client";
import {
  compressImage,
  DISH_PHOTO_OPTIONS,
  SCAN_PHOTO_OPTIONS,
} from "@/lib/images";
import { formatQuantity, parseQuantity } from "@/lib/scaling";
import type { RecipeFormValues } from "@/lib/validation";
import {
  categoryName,
  type Category,
  type RejectReason,
  type ExtractedRecipe,
  type Locale,
  type Visibility,
} from "@/lib/types";
import {
  Button,
  Chip,
  ErrorNote,
  Field,
  Input,
  Spinner,
  Textarea,
} from "@/components/ui";
import { UnitCombobox } from "@/components/unit-combobox";
import { QuantityPicker } from "@/components/quantity-picker";
import { ExtractProgress } from "@/components/extract-progress";
import { cn } from "@/lib/utils";

interface IngredientRow {
  name: string;
  quantityText: string;
  unit: string;
}

interface NewPhoto {
  blob: Blob;
  previewUrl: string;
}

interface ExistingPhoto {
  id: string;
  storage_path: string;
}

interface RecipeEditorProps {
  mode: "create" | "edit";
  recipeId?: string;
  categories: Category[];
  defaultVisibility: Visibility;
  existingScans?: ExistingPhoto[];
  initial?: {
    title: string;
    description: string;
    credit: string | null;
    ingredients: {
      name: string;
      quantity: number | null;
      unit: string | null;
    }[];
    steps: string[];
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    visibility: Visibility;
    categoryIds: string[];
    tags: string[];
  };
  existingPhotos?: ExistingPhoto[];
}

const MAX_DISH_PHOTOS = 3;
const MAX_SCANS = 3;
const DRAFT_KEY = "recipe-draft-v1";

/** Import failures that have their own explanation; anything else falls back to a generic one. */
const IMPORT_ERRORS = new Set([
  "mediaUnavailable",
  "siteBlocked",
  "unsupportedSource",
  "notRecognized",
  "videoTooLarge",
  "invalidUrl",
  "aiQuota",
  "aiBusy",
  "resolveFailed",
]);

function emptyIngredient(): IngredientRow {
  return { name: "", quantityText: "", unit: "" };
}

export function RecipeEditor({
  mode,
  recipeId,
  categories: initialCategories,
  defaultVisibility,
  initial,
  existingPhotos = [],
  existingScans = [],
}: RecipeEditorProps) {
  const t = useTranslations("recipeForm");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [tab, setTab] = useState<"manual" | "scan">("manual");
  const [categories, setCategories] = useState(initialCategories);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [credit, setCredit] = useState(initial?.credit ?? "");
  const [pasteDraft, setPasteDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [importingLink, setImportingLink] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients.map((item) => ({
      name: item.name,
      quantityText: item.quantity !== null ? formatQuantity(item.quantity) : "",
      unit: item.unit ?? "",
    })) ?? [emptyIngredient(), emptyIngredient(), emptyIngredient()],
  );
  const [steps, setSteps] = useState<string[]>(initial?.steps ?? [""]);
  const [servings, setServings] = useState(initial?.servings?.toString() ?? "");
  const [prepMinutes, setPrepMinutes] = useState(
    initial?.prepMinutes?.toString() ?? "",
  );
  const [cookMinutes, setCookMinutes] = useState(
    initial?.cookMinutes?.toString() ?? "",
  );
  const [visibility, setVisibility] = useState<Visibility>(
    initial?.visibility ?? defaultVisibility,
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categoryIds ?? [],
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  const [dishPhotos, setDishPhotos] = useState<NewPhoto[]>([]);
  const [keptPhotos, setKeptPhotos] = useState<ExistingPhoto[]>(existingPhotos);
  const [scans, setScans] = useState<NewPhoto[]>([]);
  const [extracting, setExtracting] = useState(false);
  const extractingRef = useRef(false);
  const [extracted, setExtracted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<number | null>(null);
  const [photoRetry, setPhotoRetry] = useState<{
    recipeId: string;
    photos: PendingPhoto[];
  } | null>(null);
  const [extractFailure, setExtractFailure] = useState<RejectReason | null>(null);
  const [saving, startSaving] = useTransition();
  const [savingLabel, setSavingLabel] = useState("");

  const [photosToDelete, setPhotosToDelete] = useState<ExistingPhoto[]>([]);
  const [draftAvailable, setDraftAvailable] = useState(false);

  const dishInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const manualScanInputRef = useRef<HTMLInputElement>(null);
  const canAddScans = existingScans.length + scans.length < MAX_SCANS;

  useEffect(() => {
    if (mode === "create" && localStorage.getItem(DRAFT_KEY))
      setDraftAvailable(true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || draftAvailable) return;
    const handle = setTimeout(() => {
      const hasContent =
        title.trim() ||
        ingredients.some((r) => r.name.trim()) ||
        steps.some((s) => s.trim());
      if (!hasContent) return;
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title,
          description,
          credit,
          ingredients,
          steps,
          servings,
          prepMinutes,
          cookMinutes,
          visibility,
          categoryIds,
          tags,
        }),
      );
    }, 800);
    return () => clearTimeout(handle);
  }, [
    mode,
    draftAvailable,
    title,
    description,
    credit,
    ingredients,
    steps,
    servings,
    prepMinutes,
    cookMinutes,
    visibility,
    categoryIds,
    tags,
  ]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        setTitle(draft.title ?? "");
        setDescription(draft.description ?? "");
        setCredit(draft.credit ?? "");
        if (Array.isArray(draft.ingredients) && draft.ingredients.length > 0)
          setIngredients(draft.ingredients);
        if (Array.isArray(draft.steps) && draft.steps.length > 0)
          setSteps(draft.steps);
        setServings(draft.servings ?? "");
        setPrepMinutes(draft.prepMinutes ?? "");
        setCookMinutes(draft.cookMinutes ?? "");
        setVisibility(draft.visibility === "private" ? "private" : "family");
        setCategoryIds(
          Array.isArray(draft.categoryIds) ? draft.categoryIds : [],
        );
        setTags(Array.isArray(draft.tags) ? draft.tags : []);
        setTab("manual");
      }
    } catch {
      // corrupt draft - ignore
    }
    setDraftAvailable(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftAvailable(false);
  };

  const canAddDishPhotos =
    keptPhotos.length + dishPhotos.length < MAX_DISH_PHOTOS;

  const addTag = () => {
    const value = tagDraft.trim().replace(/,/g, "");
    if (!value) return;
    if (!tags.includes(value) && tags.length < 15) setTags([...tags, value]);
    setTagDraft("");
  };

  const pickDishPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_DISH_PHOTOS - keptPhotos.length - dishPhotos.length;
    const selected = Array.from(files).slice(0, room);
    try {
      const compressed = await Promise.all(
        selected.map((file) => compressImage(file, DISH_PHOTO_OPTIONS)),
      );
      setDishPhotos((prev) => [
        ...prev,
        ...compressed.map((blob) => ({
          blob,
          previewUrl: URL.createObjectURL(blob),
        })),
      ]);
    } catch {
      toast.error(tErrors("photoUploadFailed"));
    }
  };

  const pickScans = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_SCANS - existingScans.length - scans.length;
    const selected = Array.from(files).slice(0, room);
    try {
      const compressed = await Promise.all(
        selected.map((file) => compressImage(file, SCAN_PHOTO_OPTIONS)),
      );
      setScans((prev) => [
        ...prev,
        ...compressed.map((blob) => ({
          blob,
          previewUrl: URL.createObjectURL(blob),
        })),
      ]);
    } catch {
      toast.error(tErrors("photoUploadFailed"));
    }
  };

  const applyExtracted = (recipe: ExtractedRecipe) => {
    setTitle(recipe.title);
    setDescription(recipe.description);
    if (recipe.ingredients.length > 0) {
      setIngredients(
        recipe.ingredients.map((item) => ({
          name: item.name,
          quantityText:
            item.quantity !== null ? formatQuantity(item.quantity) : "",
          unit: item.unit ?? "",
        })),
      );
    }
    if (recipe.steps.length > 0) setSteps(recipe.steps);
    setServings(recipe.servings?.toString() ?? "");
    setPrepMinutes(recipe.prep_minutes?.toString() ?? "");
    setCookMinutes(recipe.cook_minutes?.toString() ?? "");
    setTags((prev) =>
      [...new Set([...prev, ...recipe.suggested_tags])].slice(0, 15),
    );
    setExtracted(true);
    setTab("manual");
  };

  const extractVia = async (formData: FormData) => {
    setExtractFailure(null);
    setExtracting(true);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      if (response.status === 429) {
        const { error } = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(tErrors(error === "aiBusy" ? "aiBusy" : "aiQuota"), {
          duration: 8000,
        });
        return;
      }
      if (response.status === 422) {
        const { reason } = (await response.json().catch(() => ({}))) as {
          reason?: RejectReason;
        };
        // Explain what went wrong and let them choose, instead of dumping them into an empty
        // form with a red toast that says only "not recognized".
        setExtractFailure(reason ?? "other");
        logEvent("extract_not_recognized", { reason: reason ?? "other", scans: scans.length });
        return;
      }
      if (!response.ok) throw new Error("extract failed");
      const { recipe, hasUnreadableParts } = (await response.json()) as {
        recipe: ExtractedRecipe;
        hasUnreadableParts?: boolean;
      };
      applyExtracted(recipe);
      if (hasUnreadableParts)
        toast.warning(tErrors("someUnreadable"), { duration: 7000 });
    } catch (error) {
      // Stay on the scan tab and keep the photos, so a transient AI hiccup only costs one more tap.
      logEvent("extract_failed", { ...describeError(error), ...networkSnapshot() });
      toast.error(tErrors("extractRetry"), { duration: 7000 });
    } finally {
      setExtracting(false);
    }
  };

  const runExtraction = async () => {
    if (scans.length === 0 || extracting) return;
    const formData = new FormData();
    scans.forEach((scan, index) =>
      formData.append(
        "images",
        new File([scan.blob], `scan-${index}.webp`, { type: "image/webp" }),
      ),
    );
    await extractVia(formData);
  };

  /** Imports a recipe straight from a shared link (social video or a recipe site). */
  const runLinkImport = useCallback(
    async (link: string) => {
      const target = link.trim();
      if (!target || extractingRef.current) return;
      extractingRef.current = true;
      setImportingLink(true);
      setExtracting(true);
      try {
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          recipe?: ExtractedRecipe;
          image?: string | null;
          credit?: string | null;
          error?: string;
        };
        if (!response.ok || !payload.recipe) {
          toast.error(tErrors(IMPORT_ERRORS.has(payload.error ?? "") ? payload.error! : "importFailed"), {
            duration: 8000,
          });
          setTab("manual");
          return;
        }
        applyExtracted(payload.recipe);
        if (payload.credit) setCredit((prev) => prev || payload.credit!);
        if (payload.image) {
          try {
            const blob = await (await fetch(payload.image)).blob();
            const compressed = await compressImage(
              new File([blob], "import.jpg", { type: blob.type }),
              DISH_PHOTO_OPTIONS,
            );
            setDishPhotos((prev) => [
              ...prev,
              { blob: compressed, previewUrl: URL.createObjectURL(compressed) },
            ]);
          } catch {
            // The recipe matters; a missing photo is not worth failing the import over.
          }
        }
      } catch {
        toast.error(tErrors("extractRetry"), { duration: 7000 });
      } finally {
        extractingRef.current = false;
        setImportingLink(false);
        setExtracting(false);
      }
    },
    // applyExtracted only touches setState functions, which React keeps stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tErrors],
  );

  const searchParams = useSearchParams();
  const sharedLink = mode === "create" ? searchParams.get("import") : null;
  const shareFailed = mode === "create" && searchParams.get("shareFailed") === "1";

  useEffect(() => {
    if (shareFailed) toast.error(tErrors("noLinkShared"), { duration: 7000 });
  }, [shareFailed, tErrors]);

  useEffect(() => {
    // Arriving from the share sheet should just work - no extra tap to start the import.
    if (sharedLink) void runLinkImport(sharedLink);
  }, [sharedLink, runLinkImport]);

  const runTextExtraction = async () => {
    if (pasteDraft.trim().length < 20 || extracting) return;
    const formData = new FormData();
    formData.set("text", pasteDraft.trim());
    await extractVia(formData);
  };

  const buildFormValues = (): { values?: RecipeFormValues; error?: string } => {
    const cleanIngredients = ingredients
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        quantity: parseQuantity(row.quantityText),
        unit: row.unit.trim() || null,
      }));
    // Steps are optional: an ingredient-only recipe (sauce, dip, spice mix) is valid.
    const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);
    if (!title.trim()) return { error: "missingTitle" };
    if (cleanIngredients.length === 0) return { error: "missingIngredients" };

    return {
      values: {
        title: title.trim(),
        description: description.trim(),
        credit: credit.trim() || null,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        servings: servings ? Number(servings) : null,
        prepMinutes: prepMinutes ? Number(prepMinutes) : null,
        cookMinutes: cookMinutes ? Number(cookMinutes) : null,
        visibility,
        categoryIds,
        tags,
      },
    };
  };

  const save = () => {
    const { values, error: formIssue } = buildFormValues();
    if (!values) {
      setFormError(formIssue ?? "invalidInput");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setFormError(null);

    startSaving(async () => {
      setSavingLabel(tCommon("saving"));
      const result =
        mode === "create"
          ? await createRecipe(values, scans.length > 0 ? "photo" : "manual")
          : await updateRecipe(recipeId!, values);

      if (result.error || !result.id) {
        setFormError(result.error ?? "generic");
        return;
      }

      for (const photo of photosToDelete) {
        await deleteRecipePhoto(photo.id);
      }

      const targetId = result.id;
      const pending: PendingPhoto[] = [
        ...dishPhotos.map((photo, index) => ({
          blob: photo.blob,
          kind: "photo" as const,
          position: keptPhotos.length + index,
        })),
        ...scans.map((scan, index) => ({
          blob: scan.blob,
          kind: "scan" as const,
          position: index,
        })),
      ];

      const allSaved = await storePhotos(targetId, pending);
      // A failed photo keeps the person on the form with a retry button, because the recipe they
      // just wrote is worth nothing to them without the picture of it.
      if (!allSaved) return;

      leaveForRecipe(targetId);
    });
  };

  /** Uploads the photos and records them. Returns false when something is still missing. */
  const storePhotos = async (targetId: string, pending: PendingPhoto[]): Promise<boolean> => {
    if (pending.length === 0) return true;
    setSavingLabel(t("uploadingPhotos"));

    const supabase = createSupabaseBrowserClient();
    // The form can sit open for a long while (a failed scan, then typing it all in by hand), so
    // the access token may well have expired by now. This refreshes it before we need it.
    await supabase.auth.getSession();

    const report = await uploadRecipePhotos(supabase.storage.from("photos"), pending, {
      newPath: () => `${targetId}/${crypto.randomUUID()}.webp`,
      onRetry: ({ kind, attempt, error, bytes }) =>
        logEvent("photo_upload_retry", { kind, attempt, bytes, ...describeError(error), ...networkSnapshot() }, targetId),
      onFailure: ({ kind, attempts, error, bytes }) =>
        logEvent("photo_upload_failed", { kind, attempts, bytes, ...describeError(error), ...networkSnapshot() }, targetId),
    });

    // Always record what DID upload, even when a later photo failed. Skipping this was the bug
    // that made a picture appear to save and then disappear.
    if (report.uploaded.length > 0) {
      const { error } = await addRecipePhotos(targetId, report.uploaded);
      if (error) {
        logEvent("photo_upload_failed", { stage: "record", count: report.uploaded.length, error }, targetId);
        setPhotoRetry({ recipeId: targetId, photos: pending });
        return false;
      }
      logEvent("photo_upload_ok", { count: report.uploaded.length, attempts: report.attempts }, targetId);
    }

    if (report.failed.length > 0) {
      logEvent("recipe_saved_without_photos", { failed: report.failed.length, attempts: report.attempts }, targetId);
      setPhotoRetry({ recipeId: targetId, photos: report.failed });
      return false;
    }

    setPhotoRetry(null);
    return true;
  };

  const leaveForRecipe = async (targetId: string) => {
    if (mode === "create") {
      localStorage.removeItem(DRAFT_KEY);
      // Say thank you before leaving the form - a beat of praise for sharing a recipe.
      setCelebration(nextCelebration());
      await new Promise((resolve) => setTimeout(resolve, 2100));
    }
    router.push(`/recipes/${targetId}`);
    router.refresh();
  };

  /** Second chance for photos that did not make it, without re-saving the recipe. */
  const retryPhotos = () => {
    const target = photoRetry;
    if (!target) return;
    startSaving(async () => {
      const allSaved = await storePhotos(target.recipeId, target.photos);
      if (allSaved) leaveForRecipe(target.recipeId);
    });
  };

  /** Give up on the photo and go to the recipe anyway - their choice, not a silent loss. */
  const skipPhotos = () => {
    const target = photoRetry;
    if (!target) return;
    setPhotoRetry(null);
    leaveForRecipe(target.recipeId);
  };

  const removeExistingPhoto = (photo: ExistingPhoto) => {
    setKeptPhotos((prev) => prev.filter((item) => item.id !== photo.id));
    setPhotosToDelete((prev) => [...prev, photo]);
  };

  return (
    <>
      {celebration ? <RecipeSavedCelebration variant={celebration} /> : null}
      {photoRetry ? (
        <PhotoRetryNotice
          count={photoRetry.photos.length}
          pending={saving}
          onRetry={retryPhotos}
          onSkip={skipPhotos}
        />
      ) : null}
      <div className="space-y-6">
        {draftAvailable ? (
          <div className="rounded-2xl bg-honey-100 px-4 py-3.5 ring-1 ring-honey-500/25">
            <p className="text-sm font-semibold text-ink-700">
              📝 {t("draftFound")}
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" onClick={restoreDraft}>
                {t("draftRestore")}
              </Button>
              <Button size="sm" variant="ghost" onClick={discardDraft}>
                {t("draftDiscard")}
              </Button>
            </div>
          </div>
        ) : null}
        {mode === "create" ? (
          <div className="flex rounded-full bg-cream-100 p-1">
            {(["scan", "manual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-all duration-300 ease-fluid",
                  tab === value
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500",
                )}
              >
                {value === "scan" ? (
                  <ScanText size={16} strokeWidth={1.8} />
                ) : (
                  <Plus size={16} strokeWidth={1.8} />
                )}
                {value === "scan" ? t("scanTab") : t("manualTab")}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "scan" ? (
          <section className="card-shell">
            <div className="card-core space-y-5 p-6 text-center">
              <span className="text-5xl">📸</span>
              <div>
                <h2 className="font-display text-2xl font-medium text-ink-900">
                  {t("scanTitle")}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
                  {t("scanHint")}
                </p>
              </div>

              {scans.length > 0 ? (
                <div className="flex justify-center gap-3">
                  {scans.map((scan, index) => (
                    <div key={scan.previewUrl} className="relative">
                      <div className="relative aspect-[3/4] w-24 overflow-hidden rounded-xl ring-1 ring-ink-900/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={scan.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={tCommon("delete")}
                        onClick={() =>
                          setScans((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="absolute -top-2 -end-2 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white"
                      >
                        <X size={12} strokeWidth={2.2} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  pickScans(event.target.files);
                  event.target.value = "";
                }}
              />

              {extracting ? (
                <ExtractProgress
                  // Watching a video takes far longer than reading a photo, and a progress ring
                  // that finishes long before the result does reads as a stuck app.
                  estimatedMs={
                    importingLink ? 55000 : scans.length > 0 ? 14000 : 8000
                  }
                  label={
                    importingLink ? t("linkProcessing") : t("scanProcessing")
                  }
                />
              ) : (
                <>
                  {extractFailure ? (
                    <ExtractFailedNotice
                      reason={extractFailure}
                      hasPhoto={scans.length > 0}
                      onManual={() => {
                        logEvent("manual_fallback_used", {
                          reason: extractFailure,
                          scans: scans.length,
                        });
                        setExtractFailure(null);
                        setTab("manual");
                      }}
                      onRetake={() => {
                        setExtractFailure(null);
                        setScans([]);
                        scanInputRef.current?.click();
                      }}
                      onRetry={() => void runExtraction()}
                    />
                  ) : null}

                  <div className="flex flex-col items-center gap-3">
                    {scans.length < MAX_SCANS ? (
                      <Button
                        variant="outline"
                        onClick={() => scanInputRef.current?.click()}
                      >
                        <Camera size={17} strokeWidth={1.8} />
                        {t("scanPick")}
                      </Button>
                    ) : null}
                    {scans.length > 0 ? (
                      <Button
                        onClick={runExtraction}
                        size="lg"
                        className="max-w-xs"
                      >
                        <Sparkles size={17} strokeWidth={1.8} />
                        {t("scanAction")}
                      </Button>
                    ) : null}
                  </div>

                  <div className="border-t border-ink-900/8 pt-5 text-start">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
                      <Link2 size={15} strokeWidth={1.9} className="text-terra-600" />
                      {t("linkTitle")}
                    </p>
                    <p className="mt-0.5 mb-3 text-xs leading-relaxed text-ink-500">
                      {t("linkHint")}
                    </p>
                    <Input
                      value={linkDraft}
                      onChange={(e) => setLinkDraft(e.target.value)}
                      placeholder={t("linkPlaceholder")}
                      dir="ltr"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                    />
                    {linkDraft.trim().length > 8 ? (
                      <Button
                        onClick={() => runLinkImport(linkDraft)}
                        disabled={extracting}
                        className="mt-3 w-full"
                      >
                        <Sparkles size={17} strokeWidth={1.8} />
                        {t("linkButton")}
                      </Button>
                    ) : null}
                  </div>

                  <div className="border-t border-ink-900/8 pt-5 text-start">
                    <p className="text-sm font-semibold text-ink-700">
                      {t("pasteTitle")}
                    </p>
                    <p className="mt-0.5 mb-3 text-xs leading-relaxed text-ink-500">
                      {t("pasteHint")}
                    </p>
                    <Textarea
                      value={pasteDraft}
                      onChange={(e) => setPasteDraft(e.target.value)}
                      placeholder={t("pastePlaceholder")}
                      rows={5}
                      maxLength={10000}
                    />
                    {pasteDraft.trim().length >= 20 ? (
                      <Button
                        onClick={runTextExtraction}
                        className="mt-3 w-full"
                      >
                        <Sparkles size={17} strokeWidth={1.8} />
                        {t("pasteButton")}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            {extracted ? (
              <div className="rounded-2xl bg-sage-100 px-4 py-3.5 ring-1 ring-sage-600/20">
                <p className="text-sm font-semibold text-sage-700">
                  ✨ {t("scanReviewTitle")}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-sage-700/80">
                  {t("scanReviewHint")}
                </p>
              </div>
            ) : null}

            {formError ? (
              <ErrorNote>
                {formError.startsWith("missing")
                  ? t(formError)
                  : tErrors(formError)}
              </ErrorNote>
            ) : null}

            <Field label={t("title")}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={120}
              />
            </Field>

            <Field label={t("credit")} hint={t("creditHint")}>
              <Input
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder={t("creditPlaceholder")}
                maxLength={60}
              />
            </Field>

            <Field label={t("description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
                maxLength={2000}
              />
            </Field>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("ingredients")}
              </p>
              <div className="mb-1.5 grid grid-cols-[3.5rem_5rem_1fr_2rem] items-center gap-2 text-[11px] font-medium text-ink-400">
                <span className="text-center">{t("quantity")}</span>
                <span>{t("unit")}</span>
                <span>{t("ingredientName")}</span>
                <span />
              </div>
              <div className="space-y-2">
                {ingredients.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[3.5rem_5rem_1fr_2rem] items-center gap-2"
                  >
                    <QuantityPicker
                      value={row.quantityText}
                      onChange={(quantityText) =>
                        setIngredients((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, quantityText } : r,
                          ),
                        )
                      }
                    />
                    <UnitCombobox
                      value={row.unit}
                      onChange={(unit) =>
                        setIngredients((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, unit } : r,
                          ),
                        )
                      }
                      placeholder={t("unitPlaceholder")}
                    />
                    <Input
                      value={row.name}
                      onChange={(e) =>
                        setIngredients((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder={t("ingredientPlaceholder")}
                      className="min-w-0"
                    />
                    <button
                      type="button"
                      aria-label={tCommon("delete")}
                      onClick={() =>
                        setIngredients((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="flex size-8 items-center justify-center text-ink-300 transition-colors hover:text-terra-600"
                    >
                      <Trash2 size={16} strokeWidth={1.7} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setIngredients((prev) => [...prev, emptyIngredient()])
                }
                className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-terra-600"
              >
                <Plus size={15} strokeWidth={2} />
                {t("addIngredient")}
              </button>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("steps")}
              </p>
              <div className="space-y-2.5">
                {steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2.5">
                    <span className="font-display mt-3 flex size-7 shrink-0 items-center justify-center rounded-full bg-terra-50 text-xs font-semibold text-terra-700">
                      {index + 1}
                    </span>
                    <Textarea
                      value={step}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, i) =>
                            i === index ? e.target.value : s,
                          ),
                        )
                      }
                      placeholder={t("stepPlaceholder")}
                      rows={2}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      aria-label={tCommon("delete")}
                      onClick={() =>
                        setSteps((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="mt-3 shrink-0 p-1.5 text-ink-300 transition-colors hover:text-terra-600"
                    >
                      <Trash2 size={16} strokeWidth={1.7} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSteps((prev) => [...prev, ""])}
                className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-terra-600"
              >
                <Plus size={15} strokeWidth={2} />
                {t("addStep")}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={t("servings")}>
                <Input
                  value={servings}
                  onChange={(e) =>
                    setServings(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  className="text-center"
                />
              </Field>
              <Field label={t("prepMinutes")}>
                <Input
                  value={prepMinutes}
                  onChange={(e) =>
                    setPrepMinutes(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  className="text-center"
                />
              </Field>
              <Field label={t("cookMinutes")}>
                <Input
                  value={cookMinutes}
                  onChange={(e) =>
                    setCookMinutes(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  className="text-center"
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("categories")}
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    active={categoryIds.includes(category.id)}
                    onClick={() =>
                      setCategoryIds((prev) =>
                        prev.includes(category.id)
                          ? prev.filter((id) => id !== category.id)
                          : [...prev, category.id],
                      )
                    }
                  >
                    {category.emoji ? <span>{category.emoji}</span> : null}
                    {categoryName(category, locale)}
                  </Chip>
                ))}
                <AddCategoryButton
                  onCreated={(category) => {
                    setCategories((prev) => [...prev, category]);
                    setCategoryIds((prev) => [...prev, category.id]);
                  }}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("tags")}
              </p>
              {tags.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5 text-sm text-ink-700"
                    >
                      #{tag}
                      <button
                        type="button"
                        aria-label={tCommon("delete")}
                        onClick={() =>
                          setTags((prev) => prev.filter((item) => item !== tag))
                        }
                      >
                        <X
                          size={13}
                          strokeWidth={2}
                          className="text-ink-300 transition-colors hover:text-terra-600"
                        />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Input
                value={tagDraft}
                onChange={(e) => {
                  if (e.target.value.endsWith(",")) {
                    setTagDraft(e.target.value);
                    addTag();
                  } else {
                    setTagDraft(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder={t("tagsPlaceholder")}
                maxLength={30}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("photos")}{" "}
                <span className="font-normal text-ink-400">
                  ({t("photoLimit")})
                </span>
              </p>
              <div className="flex flex-wrap gap-3">
                {keptPhotos.map((photo) => (
                  <div key={photo.id} className="relative">
                    <div className="relative size-24 overflow-hidden rounded-xl ring-1 ring-ink-900/10">
                      <Image
                        src={publicPhotoUrl(photo.storage_path)}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={tCommon("delete")}
                      onClick={() => removeExistingPhoto(photo)}
                      className="absolute -top-2 -end-2 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white"
                    >
                      <X size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                {dishPhotos.map((photo, index) => (
                  <div key={photo.previewUrl} className="relative">
                    <div className="relative size-24 overflow-hidden rounded-xl ring-1 ring-ink-900/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={tCommon("delete")}
                      onClick={() =>
                        setDishPhotos((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="absolute -top-2 -end-2 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white"
                    >
                      <X size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                {canAddDishPhotos ? (
                  <button
                    type="button"
                    onClick={() => dishInputRef.current?.click()}
                    className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/70 text-ink-400 ring-1 ring-ink-900/10 transition-all duration-300 ease-fluid hover:text-terra-600 hover:ring-terra-500/40 active:scale-[0.96]"
                  >
                    <ImagePlus size={22} strokeWidth={1.5} />
                    <span className="text-[11px] font-medium">
                      {t("addPhotos")}
                    </span>
                  </button>
                ) : null}
              </div>
              <input
                ref={dishInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  pickDishPhotos(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("originalPhotos")}{" "}
                <span className="font-normal text-ink-400">
                  ({t("originalPhotosHint")})
                </span>
              </p>
              <div className="flex flex-wrap gap-3">
                {existingScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="relative aspect-[3/4] w-20 overflow-hidden rounded-xl ring-1 ring-ink-900/10"
                  >
                    <Image
                      src={publicPhotoUrl(scan.storage_path)}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                ))}
                {scans.map((scan, index) => (
                  <div key={scan.previewUrl} className="relative">
                    <div className="relative aspect-[3/4] w-20 overflow-hidden rounded-xl ring-1 ring-ink-900/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scan.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={tCommon("delete")}
                      onClick={() =>
                        setScans((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="absolute -top-2 -end-2 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white"
                    >
                      <X size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                {canAddScans ? (
                  <button
                    type="button"
                    onClick={() => manualScanInputRef.current?.click()}
                    className="flex aspect-[3/4] w-20 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/70 text-ink-400 ring-1 ring-ink-900/10 transition-all duration-300 ease-fluid hover:text-terra-600 hover:ring-terra-500/40 active:scale-[0.96]"
                  >
                    <ScanText size={20} strokeWidth={1.5} />
                    <span className="px-1 text-center text-[10px] font-medium leading-tight">
                      {t("addOriginalPhoto")}
                    </span>
                  </button>
                ) : null}
              </div>
              <input
                ref={manualScanInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  pickScans(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">
                {t("visibility")}
              </p>
              <div className="flex rounded-full bg-cream-100 p-1">
                {(["family", "private"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    className={cn(
                      "flex-1 rounded-full py-3 text-sm font-semibold transition-all duration-300 ease-fluid",
                      visibility === value
                        ? "bg-white text-ink-900 shadow-sm"
                        : "text-ink-500",
                    )}
                  >
                    {value === "family"
                      ? `👨‍👩‍👧‍👦 ${t("visibilityFamily")}`
                      : `🔒 ${t("visibilityPrivate")}`}
                  </button>
                ))}
              </div>
            </div>

            <Button size="lg" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : null}
              {saving ? savingLabel || tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function AddCategoryButton({
  onCreated,
}: {
  onCreated: (category: Category) => void;
}) {
  const t = useTranslations("recipeForm");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const result = await createCategory(name, locale);
      if (result.error || !result.category) {
        toast.error(tErrors(result.error ?? "generic"));
        return;
      }
      onCreated(result.category);
      setName("");
      setOpen(false);
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Chip className="border border-dashed border-ink-300 bg-transparent ring-0">
          <Plus size={14} strokeWidth={2} />
          {t("addCategory")}
        </Chip>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-cream-50 p-6 shadow-2xl animate-fade-in">
          <Dialog.Title className="font-display mb-4 text-xl font-medium text-ink-900">
            {t("addCategory")}
          </Dialog.Title>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("newCategoryName")}
            maxLength={40}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="mt-4 flex gap-2.5">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              className="flex-1"
              onClick={submit}
              disabled={pending || !name.trim()}
            >
              {pending ? <Spinner /> : null}
              {tCommon("add")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
