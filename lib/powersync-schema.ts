import { Schema, Table, column } from '@powersync/react-native';

export const AppSchema = new Schema({
  users: new Table(
    {
      email: column.text,
      first_name: column.text,
      last_name: column.text,
      username: column.text,
      avatar_url: column.text,
      profile_icon_url: column.text,
      phone_number: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { users_email: ['email'] } }
  ),

  farms: new Table(
    {
      user_id: column.text,
      farm_name: column.text,
      location: column.text,
      area_sqm: column.real,
      description: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { farms_user_id: ['user_id'] } }
  ),

  farm_layouts: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      blueprint_data_json: column.text,
      blueprint_image_path: column.text,
      blueprint_width_m: column.real,
      blueprint_height_m: column.real,
      snapshot_image_paths_json: column.text,
      structure_counts_json: column.text,
      unity_state_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        farm_layouts_user_id: ['user_id'],
        farm_layouts_farm_id: ['farm_id'],
      },
    }
  ),

  garden_structures: new Table(
    {
      user_id: column.text,
      farm_layout_id: column.text,
      structure_type_id: column.integer,
      source_item_id: column.text,
      label: column.text,
      display_order: column.integer,
      status: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        garden_structures_user_id: ['user_id'],
        garden_structures_farm_layout_id: ['farm_layout_id'],
      },
    }
  ),

  crop_cycles: new Table(
    {
      user_id: column.text,
      garden_structure_id: column.text,
      crop_id: column.text,
      ai_recommendation_notes: column.text,
      ai_generated_at: column.text,
      planting_date: column.text,
      expected_harvest_date: column.text,
      actual_harvest_date: column.text,
      status: column.text,
      yield_kg: column.real,
      cycle_notes: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        crop_cycles_user_id: ['user_id'],
        crop_cycles_garden_structure_id: ['garden_structure_id'],
      },
    }
  ),

  todos: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      garden_structure_id: column.text,
      title: column.text,
      notes: column.text,
      start_date: column.text,
      due_date: column.text,
      is_completed: column.integer,
      progress: column.integer,
      completed_at: column.text,
      is_notified: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        todos_user_id: ['user_id'],
        todos_farm_id: ['farm_id'],
        todos_due_date: ['due_date'],
      },
    }
  ),

  todo_comments: new Table(
    {
      todo_id: column.text,
      user_id: column.text,
      farm_id: column.text,
      comment: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        todo_comments_todo_id: ['todo_id'],
        todo_comments_farm_id: ['farm_id'],
      },
    }
  ),

  user_sms_settings: new Table(
    {
      user_id: column.text,
      is_subscribed: column.integer,
      wants_weather_sms: column.integer,
      preferred_time: column.text,
      timezone: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        user_sms_settings_user_id: ['user_id'],
      },
    }
  ),

  farm_succession_plans: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      plan_data_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        farm_succession_plans_user_id: ['user_id'],
        farm_succession_plans_farm_id: ['farm_id'],
      },
    }
  ),

  farm_checkup_results: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      image_uri: column.text,
      summary_data_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        farm_checkup_results_user_id: ['user_id'],
        farm_checkup_results_farm_id: ['farm_id'],
      },
    }
  ),

  farm_daily_reports: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      garden_structure_id: column.text,
      plot_name: column.text,
      answers_json: column.text,
      symptoms_summary_json: column.text,
      notes: column.text,
      image_uri: column.text,
      report_date: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        farm_daily_reports_user_id: ['user_id'],
        farm_daily_reports_farm_id: ['farm_id'],
        farm_daily_reports_report_date: ['report_date'],
        farm_daily_reports_structure_id: ['garden_structure_id'],
      },
    }
  ),

  teams: new Table(
    {
      owner_id: column.text,
      name: column.text,
      description: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        teams_owner_id: ['owner_id'],
      },
    }
  ),

  team_members: new Table(
    {
      team_id: column.text,
      user_id: column.text,
      role: column.text,
      status: column.text,
      invited_by: column.text,
      inviter_name: column.text,
      team_name: column.text,
      member_name: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        team_members_team_id: ['team_id'],
        team_members_user_id: ['user_id'],
      },
    }
  ),

  team_farms: new Table(
    {
      team_id: column.text,
      farm_id: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        team_farms_team_id: ['team_id'],
        team_farms_farm_id: ['farm_id'],
      },
    }
  ),

  team_folders: new Table(
    {
      team_id: column.text,
      folder_id: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        team_folders_team_id: ['team_id'],
        team_folders_folder_id: ['folder_id'],
      },
    }
  ),

  folder_audit_logs: new Table(
    {
      folder_id: column.text,
      user_id: column.text,
      action: column.text,
      details: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        folder_audit_logs_folder_id: ['folder_id'],
      },
    }
  ),


  audit_logs: new Table(
    {
      farm_id: column.text,
      farm_owner_id: column.text,
      user_id: column.text,
      action: column.text,
      details: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        audit_logs_farm_id: ['farm_id'],
      },
    }
  ),

  user_action_logs: new Table(
    {
      user_id: column.text,
      action: column.text,
      platform: column.text,
      app_version: column.text,
      metadata: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        user_action_logs_user_id: ['user_id'],
      },
    }
  ),

  farm_modules: new Table(
    {
      module_title: column.text,
      module_category: column.text,
      content: column.text,
      difficulty_level: column.text,
      thumbnail_url: column.text,
      is_published: column.integer,
      sort_order: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { farm_modules_category: ['module_category'] } }
  ),

  modules: new Table(
    {
      title: column.text,
      description: column.text,
      category: column.text,
      content: column.text,
      difficulty: column.text,
      sort_order: column.integer,
      reading_time_min: column.integer,
      thumbnail_url: column.text,
      is_published: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { modules_sort_order: ['sort_order'], modules_category: ['category'] } }
  ),

  module_quizzes: new Table(
    {
      module_id: column.text,
      title: column.text,
      description: column.text,
      passing_score: column.integer,
      questions_json: column.text,
      sort_order: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { module_quizzes_module_id: ['module_id'] } }
  ),

  user_learning_progress: new Table(
    {
      user_id: column.text,
      item_id: column.text,
      item_type: column.text,
      is_completed: column.integer,
      score: column.integer,
      stars: column.integer,
      completed_at: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        user_learning_progress_user_id: ['user_id'],
        user_learning_progress_item: ['user_id', 'item_id', 'item_type'],
      },
    }
  ),

  garden_structure_types: new Table(
    {
      type_name: column.text,
      description: column.text,
      model_3d_url: column.text,
      icon_url: column.text,
      default_width_m: column.real,
      default_length_m: column.real,
      is_active: column.integer,
      created_at: column.text,
    },
    { indexes: { garden_structure_types_type_name: ['type_name'] } }
  ),

  organic_farming_crops: new Table(
    {
      common_name: column.text,
      scientific_name: column.text,
      crop_family: column.text,
      crop_type: column.text,
      compatible_structures: column.text,
      days_to_maturity_min: column.integer,
      days_to_maturity_max: column.integer,
      ideal_ph_min: column.real,
      ideal_ph_max: column.real,
      sunlight_requirement: column.text,
      water_requirement: column.text,
      is_active: column.integer,
      status: column.text,
      created_at: column.text,
      local_name: column.text,
      season: column.text,
      nitrogen_contribution: column.text,
      nitrogen_demand: column.text,
      soil_benefit: column.text,
      succession_after: column.text,
      succession_before: column.text,
      organic_compatible: column.text,
      notes: column.text,
      planting_months: column.text,
      milestones: column.text,
    },
    { indexes: { organic_farming_crops_common_name: ['common_name'] } }
  ),

  crop_maintenance_guides: new Table(
    {
      crop_id: column.text,
      planting_instructions: column.text,
      watering_schedule: column.text,
      fertilization_guide: column.text,
      pest_management: column.text,
      harvest_instructions: column.text,
      companion_plants: column.text,
      avoid_plants: column.text,
      seasonal_notes: column.text,
      updated_at: column.text,
    },
    { indexes: { crop_maintenance_guides_crop_id: ['crop_id'] } }
  ),

  edge_models: new Table(
    {
      model_name: column.text,
      url: column.text,
      version: column.text,
      size: column.text,
      description: column.text,
      is_active: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { edge_models_is_active: ['is_active'] } }
  ),

  mitigation_plans: new Table(
    {
      problem_class: column.text,
      day: column.integer,
      title: column.text,
      description: column.text,
      is_active: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { mitigation_plans_problem_class: ['problem_class'] } }
  ),

  problem_classes: new Table(
    {
      slug: column.text,
      name: column.text,
      category: column.text,
      status: column.text,
      questions_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { problem_classes_slug: ['slug'] } }
  ),

  announcements: new Table(
    {
      title: column.text,
      category: column.text,
      summary: column.text,
      content: column.text,
      banner_url: column.text,
      priority: column.integer,
      is_active: column.integer,
      status: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { announcements_status: ['status', 'is_active'] } }
  ),

  user_certificates: new Table(
    {
      user_id: column.text,
      recipient_name: column.text,
      first_name: column.text,
      last_name: column.text,
      email: column.text,
      certificate_code: column.text,
      total_modules: column.integer,
      total_stars: column.integer,
      issue_date: column.text,
      status: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { user_certificates_user_id: ['user_id'] } }
  ),

  user_ai_daily_usage: new Table(
    {
      user_id: column.text,
      usage_date: column.text,
      count: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        user_ai_daily_usage_user_id: ['user_id'],
        user_ai_daily_usage_date: ['usage_date'],
      },
    }
  ),

  user_folder: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      folder_name: column.text,
      content_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        user_folder_user_id: ['user_id'],
        user_folder_farm_id: ['farm_id'],
      },
    }
  ),

  farm_facilities: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      farm_layout_id: column.text,
      zone_id: column.text,
      name: column.text,
      category: column.text,
      icon: column.text,
      x: column.real,
      y: column.real,
      width_m: column.real,
      height_m: column.real,
      color: column.text,
      status: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        farm_facilities_farm_id: ['farm_id'],
        farm_facilities_layout_id: ['farm_layout_id'],
        farm_facilities_user_id: ['user_id'],
      },
    }
  ),

  facility_inventories: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      facility_id: column.text,
      name: column.text,
      category: column.text,
      quantity: column.real,
      unit: column.text,
      status: column.text,
      batch_code: column.text,
      ready_date: column.text,
      notes: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        facility_inventories_facility_id: ['facility_id'],
        facility_inventories_farm_id: ['farm_id'],
        facility_inventories_user_id: ['user_id'],
      },
    }
  ),

  inventory_transactions: new Table(
    {
      user_id: column.text,
      inventory_id: column.text,
      facility_id: column.text,
      crop_cycle_id: column.text,
      garden_structure_id: column.text,
      action_type: column.text,
      quantity_change: column.real,
      reason: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        inventory_tx_inventory_id: ['inventory_id'],
        inventory_tx_facility_id: ['facility_id'],
        inventory_tx_crop_cycle_id: ['crop_cycle_id'],
      },
    }
  ),

  farm_layout_facilities: new Table(
    {
      user_id: column.text,
      farm_id: column.text,
      farm_layout_id: column.text,
      estate_layout_id: column.text,
      facility_id: column.text,
      name: column.text,
      type: column.text,
      contents: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        flf_farm_id: ['farm_id'],
        flf_layout_id: ['farm_layout_id'],
        flf_estate_layout_id: ['estate_layout_id'],
        flf_facility_id: ['facility_id'],
        flf_user_id: ['user_id'],
      },
    }
  ),

  farm_estate_layout: new Table(
    {
      user_id: column.text,
      estate_name: column.text,
      layout_data_json: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        fel_user_id: ['user_id'],
      },
    }
  ),

  reports: new Table(
    {
      user_id: column.text,
      subject: column.text,
      note: column.text,
      status: column.text,
      device_info: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        reports_user_id: ['user_id'],
        reports_status: ['status'],
      },
    }
  ),
});

export type AppSchemaType = typeof AppSchema;

