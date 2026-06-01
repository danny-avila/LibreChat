import { useCallback, useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import { useForm, Controller } from 'react-hook-form';
import useGeolocation from '~/hooks/useGeolocation';
import { SearchableSelect, SearchableMultiSelect } from '~/components/ui';
import { LangSelector } from '~/components/Nav/SettingsTabs/General/General';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Input,
  Label,
} from '@librechat/client';
import type { IFarmerProfile } from 'librechat-data-provider';
import { useSaveFarmerProfileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { STATES, DISTRICTS, BLOCKS, VILLAGES, CROPS, KVKS } from '~/utils/metaData';

// ── Form Types ───────────────────────────────────────────────────────────────

type FarmerProfileForm = {
  farmerName: string;
  age: number;
  gender: string;
  state: string;
  district: string;
  customDistrict: string;
  blockName: string;
  customBlock: string;
  villageName: string;
  customVillage: string;
  nearestKVK: string;
  phoneNo: string;
  languagePreference: string;
  yearsOfExperience: number;
  primaryCrop: string;
  secondaryCrop: string;
  awarenessOfKCC: string;
  usesAgriApps: string;
  highestEducatedPerson: string;
  numberOfSmartphones: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  landhold: string;
};

// ── Component ────────────────────────────────────────────────────────────────

const FarmerProfileModal = ({
  open,
  onOpenChange,
  onComplete,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete: () => void;
  onDecline: () => void;
}) => {
  const localize = useLocalize();
  const [langcode, setLangcode] = useRecoilState(store.lang);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FarmerProfileForm>({ mode: 'onChange' });

  const { isLocating, locationError, getLocation } = useGeolocation({
    onSuccess: (latitude, longitude) => {
      setValue('location.latitude', latitude, { shouldValidate: true });
      setValue('location.longitude', longitude, { shouldValidate: true });
    },
  });

  const selectedState = watch('state');
  const selectedDistrict = watch('district');
  const selectedBlock = watch('blockName');
  const selectedVillage = watch('villageName');
  const selectedPrimaryCrop = watch('primaryCrop');
  const selectedSecondaryCrop = watch('secondaryCrop');
  const selectedLanguagePreference = watch('languagePreference');
  const otherOption = localize('com_farmer_option_other');

  const changeLang = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });
      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
      return userLang;
    },
    [setLangcode],
  );

  useEffect(() => {
    if (!selectedLanguagePreference) {
      setValue('languagePreference', langcode, { shouldValidate: true });
    }
  }, [langcode, selectedLanguagePreference, setValue]);

  const handleStateChange = (val: string) => {
    setValue('state', val, { shouldValidate: true });
    setValue('district', '', { shouldValidate: false });
    setValue('customDistrict', '', { shouldValidate: false });
    setValue('blockName', '', { shouldValidate: false });
    setValue('villageName', '', { shouldValidate: false });
    setValue('nearestKVK', '', { shouldValidate: false });
  };

  const handleDistrictChange = (val: string) => {
    setValue('district', val, { shouldValidate: true });
    if (val !== otherOption) {
      setValue('customDistrict', '', { shouldValidate: false });
    }
    setValue('blockName', '', { shouldValidate: false });
    setValue('villageName', '', { shouldValidate: false });
    setValue('nearestKVK', '', { shouldValidate: false });
  };

  const handleBlockChange = (val: string) => {
    setValue('blockName', val, { shouldValidate: true });
    setValue('villageName', '', { shouldValidate: false });
  };

  const districtOptions = selectedState
    ? [...(DISTRICTS[selectedState] ?? []), otherOption]
    : [otherOption];

  const blockOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? [...(BLOCKS[selectedDistrict] ?? []), otherOption]
      : [otherOption];

  const villageOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? [...(VILLAGES[selectedDistrict] ?? []), otherOption]
      : [otherOption];

  const kvkOptions =
    selectedDistrict && selectedDistrict !== otherOption
      ? Array.isArray(KVKS[selectedDistrict])
        ? KVKS[selectedDistrict]
        : Array.isArray((KVKS as any).Other)
          ? (KVKS as any).Other
          : []
      : [];

  const selectedPrimaryCropList = selectedPrimaryCrop
    ? selectedPrimaryCrop
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean)
    : [];
  const selectedSecondaryCropList = selectedSecondaryCrop
    ? selectedSecondaryCrop
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean)
    : [];

  const removePrimaryCrop = (cropToRemove: string) => {
    const updated = selectedPrimaryCropList.filter((crop) => crop !== cropToRemove);
    setValue('primaryCrop', updated.join(', '), { shouldValidate: true });
  };

  const removeSecondaryCrop = (cropToRemove: string) => {
    const updated = selectedSecondaryCropList.filter((crop) => crop !== cropToRemove);
    setValue('secondaryCrop', updated.join(', '), { shouldValidate: true });
  };

  const saveMutation = useSaveFarmerProfileMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const detectDevice = (): string => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os x/i.test(ua)) return 'MacOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  };

  const onSubmit = (data: FarmerProfileForm) => {
    const resolvedDistrict = data.district === otherOption ? data.customDistrict : data.district;
    const resolvedBlock = data.blockName === otherOption ? data.customBlock : data.blockName;
    const resolvedVillage = data.villageName === otherOption ? data.customVillage : data.villageName;
    const primaryCrops = (data.primaryCrop ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const secondaryCrops = (data.secondaryCrop ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const profile: IFarmerProfile = {
      ...data,
      district: resolvedDistrict,
      blockName: resolvedBlock,
      villageName: resolvedVillage,
      age: Number(data.age),
      yearsOfExperience: Number(data.yearsOfExperience),
      numberOfSmartphones: Number(data.numberOfSmartphones),
      cropsCultivated: Array.from(new Set([...primaryCrops, ...secondaryCrops])),
      awarenessOfKCC: data.awarenessOfKCC === 'yes',
      usesAgriApps: data.usesAgriApps === 'yes',
      landhold: data.landhold ? Number(data.landhold) : undefined,
      platform: detectDevice(),
      location:
        data.location?.latitude && data.location?.longitude
          ? {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          }
          : undefined,
    };
    saveMutation.mutate(profile);
  };

  const inputClass =
    'mt-1 block w-full rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500';
  const errorClass = 'mt-1 text-xs text-red-500';
  const sectionClass = 'mb-6';
  const sectionTitleClass =
    'mb-3 text-base font-semibold text-text-primary border-b border-border-heavy pb-1';
  const fieldClass = 'mb-4';
  const decimalRegex = /^\d+(\.\d+)?$/;
  const genderOptions = [
    localize('com_farmer_option_male'),
    localize('com_farmer_option_female'),
    localize('com_farmer_option_other'),
  ];
  const cropsOptions:any = [
    localize('crop_adapathiyan'),
    localize('crop_agathi'),
    localize('crop_ailanthus_or_matti'),
    localize('crop_ajwain_carom_seeds'),
    localize('crop_allspice'),
    localize('crop_almond'),
    localize('crop_aloe_vera'),
    localize('crop_amaranth'),
    localize('crop_amaranthus'),
    localize('crop_amla'),
    localize('crop_anthurium'),
    localize('crop_apple'),
    localize('crop_apricot'),
    localize('crop_arecanut'),
    localize('crop_arhar'),
    localize('crop_arhar_dal_red_gram'),
    localize('crop_aromatic_rice'),
    localize('crop_arrow_root'),
    localize('crop_arum_elephant_foot_yam'),
    localize('crop_arum_lobe'),
    localize('crop_arum_stem'),
    localize('crop_ash_gourd_upper'),
    localize('crop_ash_gourd_lower'),
    localize('crop_ashwagandha'),
    localize('crop_asoka'),
    localize('crop_avocado'),
    localize('crop_babool_indian_gum_arabic_tree'),
    localize('crop_babool_tree'),
    localize('crop_baby_corn_space'),
    localize('crop_babycorn_joined'),
    localize('crop_bajra_pearl_millet'),
    localize('crop_bamboo'),
    localize('crop_banana'),
    localize('crop_banana_stem'),
    localize('crop_barley'),
    localize('crop_barnyard_millet_upper'),
    localize('crop_barnyard_millet_lower'),
    localize('crop_beans'),
    localize('crop_beet_root_space'),
    localize('crop_beetroot_joined'),
    localize('crop_bengal_gram_clean'),
    localize('crop_bengal_gram_chickpea'),
    localize('crop_ber'),
    localize('crop_ber_jujube'),
    localize('crop_berseem'),
    localize('crop_betel_leaf_upper'),
    localize('crop_betel_leaf_lower'),
    localize('crop_betel_vine'),
    localize('crop_bethua_leaves'),
    localize('crop_beto_shak'),
    localize('crop_bird_of_paradise'),
    localize('crop_bitter_gourd_upper'),
    localize('crop_bitter_gourd_lower'),
    localize('crop_black_cumin'),
    localize('crop_black_gram_upper'),
    localize('crop_black_grapes'),
    localize('crop_black_pepper_upper'),
    localize('crop_black_gram_lower'),
    localize('crop_black_pepper_lower'),
    localize('crop_blueberry'),
    localize('crop_bottle_gourd_upper'),
    localize('crop_bottle_gourd_lower'),
    localize('crop_brahmi'),
    localize('crop_brinjal'),
    localize('crop_brinjal_eggplant_bracket'),
    localize('crop_brinjal_eggplant_slash'),
    localize('crop_broad_beans'),
    localize('crop_broccoli_correct'),
    localize('crop_brocolli_typo'),
    localize('crop_brown_top_millet'),
    localize('crop_buckwheat'),
    localize('crop_butter_mahua_tree'),
    localize('crop_cabbage'),
    localize('crop_camboge'),
    localize('crop_capsicum'),
    localize('crop_cardamom'),
    localize('crop_carnation'),
    localize('crop_carom'),
    localize('crop_carrot'),
    localize('crop_cashew'),
    localize('crop_cassava_tapioca'),
    localize('crop_cassia'),
    localize('crop_castor'),
    localize('crop_casuarina'),
    localize('crop_cauliflower'),
    localize('crop_celery'),
    localize('crop_celery_seeds'),
    localize('crop_ceylon_spinach'),
    localize('crop_chadachi'),
    localize('crop_char_magaz'),
    localize('crop_chayote'),
    localize('crop_chengazhinirkizhangu'),
    localize('crop_chethikoduveli'),
    localize('crop_chick_pea_space'),
    localize('crop_chickpea_joined'),
    localize('crop_chickpea_bengal_gram_comma'),
    localize('crop_chikoo'),
    localize('crop_chilli_i'),
    localize('crop_chilly_y'),
    localize('crop_china_aster'),
    localize('crop_chinese_cabbage'),
    localize('crop_chittadalotakam'),
    localize('crop_chittaratha'),
    localize('crop_chow_chow'),
    localize('crop_chrysanthemum'),
    localize('crop_cinnamon'),
    localize('crop_citronella_grass'),
    localize('crop_citrus'),
    localize('crop_clove_singular'),
    localize('crop_cloves_plural'),
    localize('crop_cluster_bean'),
    localize('crop_cocoa'),
    localize('crop_coconut'),
    localize('crop_coffee'),
    localize('crop_coleus'),
    localize('crop_colocacia_c'),
    localize('crop_colocasia_s'),
    localize('crop_congosignal_grass'),
    localize('crop_coriander'),
    localize('crop_coriander_cilantro'),
    localize('crop_coriander_leaves_seeds'),
    localize('crop_cotton'),
    localize('crop_cowpea'),
    localize('crop_crossandra'),
    localize('crop_cucumber'),
    localize('crop_cumin'),
    localize('crop_cumin_seeds'),
    localize('crop_curry_leaves'),
    localize('crop_custard_apple_upper'),
    localize('crop_custard_apple_lower'),
    localize('crop_daincha'),
    localize('crop_danthappala'),
    localize('crop_darjeeling_orange'),
    localize('crop_date'),
    localize('crop_date_palm_upper'),
    localize('crop_date_palm_lower'),
    localize('crop_davana'),
    localize('crop_dill_leaves'),
    localize('crop_dillseed'),
    localize('crop_dragon_fruit'),
    localize('crop_drumstick'),
    localize('crop_drumstick_moringa'),
    localize('crop_elephant_apple'),
    localize('crop_elephant_foot_yam'),
    localize('crop_eucalyptus'),
    localize('crop_fennel'),
    localize('crop_fenugreek'),
    localize('crop_fenugreek_methi'),
    localize('crop_field_pea'),
    localize('crop_fig'),
    localize('crop_finger_millet_upper'),
    localize('crop_finger_millet_lower'),
    localize('crop_firecracker_flower'),
    localize('crop_fodder_cowpea'),
    localize('crop_fodder_maize'),
    localize('crop_fodder_sorghum'),
    localize('crop_foxtail_millet_upper'),
    localize('crop_foxtail_millet_lower'),
    localize('crop_french_bean'),
    localize('crop_gaillardia'),
    localize('crop_galgal_hill_lemon'),
    localize('crop_gamba_grass'),
    localize('crop_garlic'),
    localize('crop_geranium'),
    localize('crop_gerbera'),
    localize('crop_german_turnip'),
    localize('crop_gherkins'),
    localize('crop_ginger'),
    localize('crop_gladiolus'),
    localize('crop_gliricidia'),
    localize('crop_gram'),
    localize('crop_grape_singular'),
    localize('crop_grapes_plural'),
    localize('crop_greater_yam'),
    localize('crop_green_cardamom'),
    localize('crop_green_chilli'),
    localize('crop_green_gram_upper'),
    localize('crop_green_mango'),
    localize('crop_green_papaya'),
    localize('crop_green_peas_plural'),
    localize('crop_green_gram_lower'),
    localize('crop_green_gram_golden_gram'),
    localize('crop_green_pea_singular'),
    localize('crop_greeng_gram_typo'),
    localize('crop_ground_nut_space'),
    localize('crop_groundnut_joined'),
    localize('crop_guava'),
    localize('crop_guinea_grass'),
    localize('crop_gymnema_sugar_destroyer'),
    localize('crop_hedge_lucerne'),
    localize('crop_heliconia'),
    localize('crop_hogplum'),
    localize('crop_holy_basil'),
    localize('crop_honey_plant'),
    localize('crop_hops'),
    localize('crop_horse_gram_space_upper'),
    localize('crop_horse_gram_space_lower'),
    localize('crop_horsegram_joined'),
    localize('crop_hyacinth_bean_clean'),
    localize('crop_hyacinth_bean_or_lablab_bean'),
    localize('crop_hybrid_napier'),
    localize('crop_indian_beech_pongam_tree'),
    localize('crop_indian_beech_tree'),
    localize('crop_indian_blackberry'),
    localize('crop_indian_butter_tree_mahua'),
    localize('crop_indian_gooseberry_upper'),
    localize('crop_indian_gooseberry_amla'),
    localize('crop_indian_jujube_ber'),
    localize('crop_indian_gooseberry_lower'),
    localize('crop_indian_hogweed_spiny_amaranth'),
    localize('crop_indian_mustard'),
    localize('crop_indian_sarsaparilla_mangani_root'),
    localize('crop_indigo'),
    localize('crop_irul'),
    localize('crop_ivy_gourd_upper'),
    localize('crop_ivy_gourd_lower'),
    localize('crop_jack_short'),
    localize('crop_jack_fruit_space_upper'),
    localize('crop_jack_fruit_space_lower'),
    localize('crop_jackfruit_joined'),
    localize('crop_jamun'),
    localize('crop_jamun_fruit'),
    localize('crop_japanese_persimmon'),
    localize('crop_jasmine'),
    localize('crop_jeevakom'),
    localize('crop_jicama'),
    localize('crop_jute_leaves'),
    localize('crop_kacholam'),
    localize('crop_kagzi_lime'),
    localize('crop_kalai_dal'),
    localize('crop_kampakam'),
    localize('crop_kanjiram'),
    localize('crop_karinochi'),
    localize('crop_karonda'),
    localize('crop_kashi_kanagile'),
    localize('crop_kasthurimanjal'),
    localize('crop_kattarvazha'),
    localize('crop_kidney_bean_upper'),
    localize('crop_kidney_bean_lower'),
    localize('crop_kidney_bean_rajama'),
    localize('crop_kinnow_mandarin'),
    localize('crop_kiwifruit'),
    localize('crop_knol_khol'),
    localize('crop_kodo_millet'),
    localize('crop_kokum'),
    localize('crop_koovalam'),
    localize('crop_kurumthotti'),
    localize('crop_kusuma'),
    localize('crop_ladys_finger'),
    localize('crop_large_cardamom'),
    localize('crop_lemon'),
    localize('crop_lemongrass'),
    localize('crop_lentil'),
    localize('crop_lesser_yarm'),
    localize('crop_lettuce'),
    localize('crop_lime_lemon'),
    localize('crop_linseed_clean'),
    localize('crop_linseed_flax'),
    localize('crop_litchi'),
    localize('crop_little_millet_upper'),
    localize('crop_little_millet_lower'),
    localize('crop_long_melon'),
    localize('crop_long_pepper'),
    localize('crop_loquat'),
    localize('crop_lucerne'),
    localize('crop_mahagony_variant'),
    localize('crop_mahogany_standard'),
    localize('crop_maize'),
    localize('crop_malabar_neem'),
    localize('crop_mandarin'),
    localize('crop_mandarin_orange'),
    localize('crop_mangium'),
    localize('crop_mango'),
    localize('crop_mango_ginger'),
    localize('crop_mangosteen'),
    localize('crop_marigold'),
    localize('crop_mash'),
    localize('crop_matar_dal_split_peas'),
    localize('crop_mentha'),
    localize('crop_mesta'),
    localize('crop_millet'),
    localize('crop_moong'),
    localize('crop_moong_dal'),
    localize('crop_moth_bean_upper'),
    localize('crop_moth_bean_lower'),
    localize('crop_mung'),
    localize('crop_mung_bean'),
    localize('crop_mushroom'),
    localize('crop_muskmelon'),
    localize('crop_mustard'),
    localize('crop_musur_dal'),
    localize('crop_napier_grass'),
    localize('crop_neela_amari'),
    localize('crop_neem_clean'),
    localize('crop_neem_ground_type'),
    localize('crop_niger'),
    localize('crop_nilappana'),
    localize('crop_nutmeg'),
    localize('crop_oat_singular'),
    localize('crop_oats_plural'),
    localize('crop_oilpalm'),
    localize('crop_okra'),
    localize('crop_okra_ladys_finger'),
    localize('crop_olive'),
    localize('crop_onion'),
    localize('crop_orange'),
    localize('crop_orange_sweet_orange_mosambi'),
    localize('crop_orchids'),
    localize('crop_paddy'),
    localize('crop_paddy_rice'),
    localize('crop_palmarosa'),
    localize('crop_palmarosa_grass'),
    localize('crop_palmyra_palm'),
    localize('crop_papaya'),
    localize('crop_para_grass'),
    localize('crop_paradise_tree'),
    localize('crop_passion_fruit'),
    localize('crop_patchouli'),
    localize('crop_pathimugham'),
    localize('crop_pea'),
    localize('crop_peach'),
    localize('crop_pear'),
    localize('crop_pearl_millet_upper'),
    localize('crop_pearl_millet_lower'),
    localize('crop_pecan_nut'),
    localize('crop_physic_nut_jatropha'),
    localize('crop_pickling_melon'),
    localize('crop_pigeon_pea_upper'),
    localize('crop_pigeon_pea_lower'),
    localize('crop_pigeon_pea_red_gram'),
    localize('crop_pineapple'),
    localize('crop_plum'),
    localize('crop_pointed_gourd'),
    localize('crop_pomegranate'),
    localize('crop_potato'),
    localize('crop_proso_millet_one_l'),
    localize('crop_proso_millet_two_l_typo'),
    localize('crop_pumpkin'),
    localize('crop_punna'),
    localize('crop_quina'),
    localize('crop_raddish_two_d_typo'),
    localize('crop_radish_one_d_correct'),
    localize('crop_ragi'),
    localize('crop_ramboothan'),
    localize('crop_ramphal'),
    localize('crop_rapeseed_and_mustard'),
    localize('crop_raw_bengal_gram'),
    localize('crop_red_chilli'),
    localize('crop_red_gram_pigeon_pea'),
    localize('crop_red_sandalwood_clean'),
    localize('crop_red_sanders_red_sandalwood'),
    localize('crop_red_gram_lower'),
    localize('crop_rice'),
    localize('crop_rice_paddy'),
    localize('crop_ridge_gourd_upper'),
    localize('crop_ridge_gourd_lower'),
    localize('crop_ripe_papaya'),
    localize('crop_rose'),
    localize('crop_rose_greenhouse'),
    localize('crop_roselle_red_sorrel'),
    localize('crop_rosemary'),
    localize('crop_rosewood'),
    localize('crop_round_gourd'),
    localize('crop_rubber'),
    localize('crop_ryegrass'),
    localize('crop_safed_musli'),
    localize('crop_safflower'),
    localize('crop_sandal'),
    localize('crop_sandalwood'),
    localize('crop_sapodilla_chiku'),
    localize('crop_sapota'),
    localize('crop_sarpagandha_indian_snakeroot'),
    localize('crop_senji'),
    localize('crop_sesame'),
    localize('crop_sesame_gingelly'),
    localize('crop_setaria_grass'),
    localize('crop_shaftal'),
    localize('crop_shah_marich'),
    localize('crop_shevri'),
    localize('crop_snake_gourd_upper'),
    localize('crop_snake_gourd_lower'),
    localize('crop_sorghum'),
    localize('crop_sorghum_fodder'),
    localize('crop_sorghum_rabi_kharif'),
    localize('crop_soyabean_a'),
    localize('crop_soybean_no_a'),
    localize('crop_spinach'),
    localize('crop_sponge_gourd'),
    localize('crop_squash'),
    localize('crop_stevia'),
    localize('crop_strawberry'),
    localize('crop_stylo'),
    localize('crop_subabul'),
    localize('crop_sugarbeet'),
    localize('crop_sugarcane'),
    localize('crop_summer_squash'),
    localize('crop_sun_hemp'),
    localize('crop_sunflower'),
    localize('crop_sweet_cherry'),
    localize('crop_sweet_lemon'),
    localize('crop_sweet_lime'),
    localize('crop_sweet_orange'),
    localize('crop_sweet_pepper'),
    localize('crop_sweet_potato'),
    localize('crop_tamarind'),
    localize('crop_tapioca'),
    localize('crop_tea'),
    localize('crop_teak'),
    localize('crop_thembavu'),
    localize('crop_thippali'),
    localize('crop_thorny_bamboo'),
    localize('crop_thulasi'),
    localize('crop_tobacco'),
    localize('crop_tomato'),
    localize('crop_tree_tomato'),
    localize('crop_tuberose'),
    localize('crop_tulsi_holy_basil'),
    localize('crop_turmeric'),
    localize('crop_turnip'),
    localize('crop_urd'),
    localize('crop_vanilla'),
    localize('crop_vegetable_cowpea'),
    localize('crop_venga'),
    localize('crop_vetiver'),
    localize('crop_vetiver_khus_grass'),
    localize('crop_walnut'),
    localize('crop_wanga'),
    localize('crop_water_melon_space'),
    localize('crop_watermelon_joined'),
    localize('crop_west_indian_cherry'),
    localize('crop_wheat'),
    localize('crop_white_yam'),
    localize('crop_wild_tamarind'),
    localize('crop_wild_date_palm'),
    localize('crop_wild_indigo'),
    localize('crop_wild_jack_or_aini'),
    localize('crop_wood_apple'),
    localize('crop_yam'),
  ];
  const educationOptions = [
    localize('com_farmer_option_under_graduate'),
    localize('com_farmer_option_graduate'),
    localize('com_farmer_option_post_graduate'),
  ];
  const yesLabel = localize('com_ui_yes');
  const noLabel = localize('com_ui_no');
  const yesNoOptions = [
    { label: yesLabel, value: 'yes' },
    { label: noLabel, value: 'no' },
  ];

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[90vh] w-11/12 max-w-2xl flex-col overflow-y-hidden sm:w-3/4 md:w-2/3 lg:w-1/2"
      >
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-bold text-text-primary">
            {localize('com_farmer_profile_registration')}
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" {...register('location.latitude')} />
          <input type="hidden" {...register('location.longitude')} />

          {/* ── Notice — pinned above the scrollable area ── */}
          <p className="shrink-0 px-1 pb-3 text-sm font-medium text-red-500">
            {localize('com_farmer_profile_fill_all_required')}
          </p>

          <div className="flex-1 overflow-y-auto px-1 py-2">
            <div className={fieldClass}>
              <Controller
                name="languagePreference"
                control={control}
                rules={{ required: localize('com_farmer_validation_language_required') }}
                render={({ field }) => (
                  <LangSelector
                    langcode={(field.value as string) ?? langcode}
                    onChange={(value) => {
                      const resolvedLang = changeLang(value);
                      field.onChange(resolvedLang);
                    }}
                    portal={false}
                  />
                )}
              />
              {errors.languagePreference && (
                <p className={errorClass}>{errors.languagePreference.message}</p>
              )}
            </div>
            {/* ── Section 1: Demographic Details ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_demographic_details')}</h3>

              <div className={fieldClass}>
                <Label htmlFor="farmerName">{localize('com_farmer_label_farmer_name')}</Label>
                <Input
                  id="farmerName"
                  placeholder={localize('com_farmer_placeholder_full_name')}
                  className={inputClass}
                  {...register('farmerName', {
                    required: localize('com_farmer_validation_farmer_name_required'),
                  })}
                />
                {errors.farmerName && <p className={errorClass}>{errors.farmerName.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="age">{localize('com_farmer_label_age')}</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder={localize('com_farmer_placeholder_age')}
                    defaultValue={16}
                    min={16}
                    max={100}
                    step={1}
                    className={inputClass}
                    {...register('age', {
                      required: localize('com_farmer_validation_age_required'),
                      valueAsNumber: true,
                      validate: {
                        isInteger: (value) =>
                          Number.isInteger(value) ||
                          localize('com_farmer_validation_age_integer'),
                        inRange: (value) =>
                          (value >= 16 && value <= 100) ||
                          localize('com_farmer_validation_age_range'),
                      },
                    })}
                  />
                  {errors.age && <p className={errorClass}>{errors.age.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label>{localize('com_farmer_label_gender')}</Label>
                  <Controller
                    name="gender"
                    control={control}
                    rules={{ required: localize('com_farmer_validation_gender_required') }}
                    render={({ field }) => (
                      <SearchableSelect
                        options={genderOptions}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={localize('com_farmer_placeholder_select_gender')}
                      />
                    )}
                  />
                  {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
                </div>
              </div>

              {/* ── Location ── */}
              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_current_location')}</Label>
                <div className="mb-3 mt-2 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-blue-400 dark:text-blue-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3 text-sm text-blue-700 dark:text-blue-400">
                      <p>
                        {localize('com_farmer_helper_location_capture')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={getLocation}
                    disabled={isLocating}
                    className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLocating
                      ? localize('com_farmer_button_locating')
                      : localize('com_farmer_button_get_location')}
                  </button>
                  {watch('location.latitude') && watch('location.longitude') && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-500">
                      {localize('com_farmer_location_captured_success')}
                    </span>
                  )}
                  {locationError && <span className="text-sm text-red-500">{locationError}</span>}
                </div>
              </div>

              {/* ── State → District → Block → Village ── */}
              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_state')}</Label>
                <Controller
                  name="state"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_state_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={STATES}
                      value={field.value ?? ''}
                      onChange={handleStateChange}
                      placeholder={localize('com_farmer_placeholder_select_state')}
                    />
                  )}
                />
                {errors.state && <p className={errorClass}>{errors.state.message}</p>}
              </div>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_district')}</Label>
                <Controller
                  name="district"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_district_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={districtOptions}
                      value={field.value ?? ''}
                      onChange={handleDistrictChange}
                      placeholder={
                        selectedState
                          ? localize('com_farmer_placeholder_select_district')
                          : localize('com_farmer_placeholder_select_state_first')
                      }
                      disabled={!selectedState}
                    />
                  )}
                />
                {errors.district && <p className={errorClass}>{errors.district.message}</p>}
              </div>

              {/* Custom district input – shown only when "Other" is selected */}
              {selectedDistrict === otherOption && (
                <div className={fieldClass}>
                  <Label htmlFor="customDistrict">{localize('com_farmer_label_custom_district')}</Label>
                  <Input
                    id="customDistrict"
                    placeholder={localize('com_farmer_placeholder_custom_district')}
                    className={inputClass}
                    {...register('customDistrict', {
                      required: localize('com_farmer_validation_custom_district_required'),
                    })}
                  />
                  {errors.customDistrict && (
                    <p className={errorClass}>{errors.customDistrict.message}</p>
                  )}
                </div>
              )}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_block_name')}</Label>
                <Controller
                  name="blockName"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_block_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={blockOptions}
                      value={field.value ?? ''}
                      onChange={handleBlockChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_block')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />
                {errors.blockName && <p className={errorClass}>{errors.blockName.message}</p>}
              </div>

              {selectedBlock === otherOption && (
                <div className={fieldClass}>
                  <Label htmlFor="customBlock">{localize('com_farmer_label_custom_block')}</Label>
                  <Input
                    id="customBlock"
                    placeholder={localize('com_farmer_placeholder_custom_block')}
                    className={inputClass}
                    {...register('customBlock', {
                      required: localize('com_farmer_validation_custom_block_required'),
                    })}
                  />
                  {errors.customBlock && <p className={errorClass}>{errors.customBlock.message}</p>}
                </div>
              )}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_village_name')}</Label>
                <Controller
                  name="villageName"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_village_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={villageOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_village')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />
                {errors.villageName && <p className={errorClass}>{errors.villageName.message}</p>}
              </div>

              {selectedBlock === otherOption || selectedVillage === otherOption ? (
                <div className={fieldClass}>
                  <Label htmlFor="customVillage">{localize('com_farmer_label_custom_village')}</Label>
                  <Input
                    id="customVillage"
                    placeholder={localize('com_farmer_placeholder_custom_village')}
                    className={inputClass}
                    {...register('customVillage', {
                      required: localize('com_farmer_validation_custom_village_required'),
                    })}
                  />
                  {errors.customVillage && (
                    <p className={errorClass}>{errors.customVillage.message}</p>
                  )}
                </div>
              ) : null}

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_nearest_kvk')}</Label>

                <Controller
                  name="nearestKVK"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_nearest_kvk_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={kvkOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={
                        selectedDistrict
                          ? localize('com_farmer_placeholder_select_nearest_kvk')
                          : localize('com_farmer_placeholder_select_district_first')
                      }
                      disabled={!selectedDistrict}
                    />
                  )}
                />

                {errors.nearestKVK && (
                  <p className={errorClass}>
                    {errors.nearestKVK.message}
                  </p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="phoneNo">{localize('com_farmer_label_phone_number')}</Label>
                <Input
                  id="phoneNo"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={localize('com_farmer_placeholder_phone_number')}
                  className={inputClass}
                  {...register('phoneNo', {
                    required: localize('com_farmer_validation_phone_required'),
                    pattern: {
                      value: /^\d{10}$/,
                      message: localize('com_farmer_validation_phone_exact_10'),
                    },
                  })}
                />
                {errors.phoneNo && <p className={errorClass}>{errors.phoneNo.message}</p>}
              </div>
            </div>

            {/* ── Section 2: Agricultural Background ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_agricultural_background')}</h3>

              <div className={fieldClass}>
                <Label htmlFor="yearsOfExperience">{localize('com_farmer_label_years_experience')}</Label>
                <Input
                  id="yearsOfExperience"
                  type="number"
                  placeholder={localize('com_farmer_placeholder_years')}
                  defaultValue={0}
                  min={0}
                  max={70}
                  step={1}
                  className={inputClass}
                  {...register('yearsOfExperience', {
                    required: localize('com_farmer_validation_experience_required'),
                    valueAsNumber: true,
                    validate: {
                      isInteger: (value) =>
                        Number.isInteger(value) ||
                        localize('com_farmer_validation_experience_integer'),
                      inRange: (value) =>
                        (value >= 0 && value <= 70) ||
                        localize('com_farmer_validation_experience_range'),
                    },
                  })}
                />
                {errors.yearsOfExperience && (
                  <p className={errorClass}>{errors.yearsOfExperience.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="landhold">{localize('com_farmer_label_landholding')}</Label>
                <Input
                  id="landhold"
                  type="text"
                  inputMode="decimal"
                  placeholder={localize('com_farmer_placeholder_landholding')}
                  className={inputClass}
                  {...register('landhold', {
                    required: localize('com_farmer_validation_landholding_required'),
                    validate: (value) => {
                      const normalized = String(value ?? '').trim();
                      return decimalRegex.test(normalized) ||
                        localize('com_farmer_validation_landholding_valid');
                    },
                  })}
                />
                {errors.landhold && (
                  <p className={errorClass}>{errors.landhold.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={fieldClass}>
                  <Label htmlFor="primaryCrop">{localize('com_farmer_label_primary_crop')}</Label>
                  <SearchableMultiSelect
                    options={cropsOptions}
                    value={selectedPrimaryCropList}
                    onChange={(selected) =>
                      setValue('primaryCrop', selected.join(', '), { shouldValidate: true })
                    }
                    placeholder={localize('com_ui_select_options')}
                  />
                  {selectedPrimaryCropList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPrimaryCropList.map((crop) => (
                        <span
                          key={crop}
                          className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        >
                          {crop}
                          <button
                            type="button"
                            onClick={() => removePrimaryCrop(crop)}
                            className="rounded-full p-0.5 text-green-800 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-800/40"
                            aria-label={`Remove ${crop}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="hidden"
                    {...register('primaryCrop', {
                      required: localize('com_farmer_validation_primary_crop_required'),
                    })}
                  />
                  {errors.primaryCrop && <p className={errorClass}>{errors.primaryCrop.message}</p>}
                </div>

                <div className={fieldClass}>
                  <Label htmlFor="secondaryCrop">{localize('com_farmer_label_secondary_crop')}</Label>
                  <SearchableMultiSelect
                    options={cropsOptions}
                    value={selectedSecondaryCropList}
                    onChange={(selected) =>
                      setValue('secondaryCrop', selected.join(', '), { shouldValidate: true })
                    }
                    placeholder={localize('com_ui_select_options')}
                  />
                  {selectedSecondaryCropList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedSecondaryCropList.map((crop) => (
                        <span
                          key={crop}
                          className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        >
                          {crop}
                          <button
                            type="button"
                            onClick={() => removeSecondaryCrop(crop)}
                            className="rounded-full p-0.5 text-green-800 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-800/40"
                            aria-label={`Remove ${crop}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="hidden"
                    {...register('secondaryCrop', {
                      required: localize('com_farmer_validation_secondary_crop_required'),
                    })}
                  />
                  {errors.secondaryCrop && (
                    <p className={errorClass}>{errors.secondaryCrop.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 3: Awareness & Digital Adoption ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_awareness_section')}</h3>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_awareness_kcc')}</Label>
                <div className="mt-2 flex gap-6">
                  {yesNoOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="radio"
                        value={option.value}
                        className="accent-green-600"
                        {...register('awarenessOfKCC', {
                          required: localize('com_farmer_validation_field_required'),
                        })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {errors.awarenessOfKCC && (
                  <p className={errorClass}>{errors.awarenessOfKCC.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_usage_agri_apps')}</Label>
                <div className="mt-2 flex gap-6">
                  {yesNoOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="radio"
                        value={option.value}
                        className="accent-green-600"
                        {...register('usesAgriApps', {
                          required: localize('com_farmer_validation_field_required'),
                        })}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {errors.usesAgriApps && <p className={errorClass}>{errors.usesAgriApps.message}</p>}
              </div>
            </div>

            {/* ── Section 4: Socio-Economic Indicator ── */}
            <div className={sectionClass}>
              <h3 className={sectionTitleClass}>{localize('com_farmer_profile_socio_economic')}</h3>

              <div className={fieldClass}>
                <Label>{localize('com_farmer_label_highest_educated')}</Label>
                <Controller
                  name="highestEducatedPerson"
                  control={control}
                  rules={{ required: localize('com_farmer_validation_field_required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      options={educationOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder={localize('com_farmer_placeholder_select_education_level')}
                    />
                  )}
                />
                {errors.highestEducatedPerson && (
                  <p className={errorClass}>{errors.highestEducatedPerson.message}</p>
                )}
              </div>

              <div className={fieldClass}>
                <Label htmlFor="numberOfSmartphones">{localize('com_farmer_label_smartphone_count')}</Label>
                <Input
                  id="numberOfSmartphones"
                  type="number"
                  placeholder={localize('com_farmer_placeholder_smartphone_count')}
                  defaultValue={0}
                  min={0}
                  max={20}
                  step={1}
                  className={inputClass}
                  {...register('numberOfSmartphones', {
                    required: localize('com_farmer_validation_smartphones_required'),
                    valueAsNumber: true,
                    validate: {
                      isInteger: (value) =>
                        Number.isInteger(value) ||
                        localize('com_farmer_validation_smartphones_integer'),
                      inRange: (value) =>
                        (value >= 0 && value <= 20) ||
                        localize('com_farmer_validation_smartphones_range'),
                    },
                  })}
                />
                {errors.numberOfSmartphones && (
                  <p className={errorClass}>{errors.numberOfSmartphones.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-2 flex shrink-0 justify-end gap-2 border-t border-border-heavy px-1 pt-4">
            <button
              type="button"
              onClick={() => reset()}
              disabled={saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localize('com_ui_reset')}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              {saveMutation.isLoading ? `${localize('com_ui_submit')}...` : localize('com_ui_submit')}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default FarmerProfileModal;

