# frozen_string_literal: true

require 'base64'
require 'json'
require 'time'

# =============================================================================
# PhoneCenterCRM — Patch Nativo: Instagram API com Meta Unified Login (v27.0)
# Baseado nos PRs oficiais do Chatwoot v4.20 (#16645 e #16647), adaptado para o
# schema single-tenant do EvoCRM Community sem exigir migrations no PostgreSQL.
# =============================================================================

module PhoneCenter
  module InstagramUnified
    class Error < StandardError; end

    DM_ID_FORMAT = /\A(new_ig_dm_item|ig_dm_item):1:IGMessageID:\d+:\d+:\d+\z/
    DM_ID_ESCAPES = { 'A' => 'Z', 'B' => '/', 'C' => '+', 'D' => '=' }.freeze
    DM_ID_ENCODINGS = DM_ID_ESCAPES.invert.freeze

    module_function

    def config_id
      ENV['INSTAGRAM_CONFIG_ID'].to_s.strip.presence ||
        GlobalConfigService.load('INSTAGRAM_CONFIG_ID', nil).to_s.strip.presence
    end

    def enabled?
      config_id.present?
    end

    def client_id
      ENV['INSTAGRAM_UNIFIED_APP_ID'].to_s.strip.presence ||
        GlobalConfigService.load('INSTAGRAM_APP_ID', nil).to_s.strip.presence ||
        GlobalConfigService.load('FB_APP_ID', nil).to_s.strip.presence
    end

    def client_secret
      ENV['INSTAGRAM_UNIFIED_APP_SECRET'].to_s.strip.presence ||
        GlobalConfigService.load('INSTAGRAM_APP_SECRET', nil).to_s.strip.presence ||
        GlobalConfigService.load('FB_APP_SECRET', nil).to_s.strip.presence
    end

    def api_version
      raw = ENV['INSTAGRAM_UNIFIED_API_VERSION'].to_s.strip.presence ||
            GlobalConfigService.load('INSTAGRAM_API_VERSION', 'v23.0').to_s.strip.presence ||
            'v25.0'
      raw.start_with?('v') ? raw : "v#{raw}"
    end

    def graph_base_uri
      "https://graph.facebook.com/#{api_version}"
    end

    def authorization_url(redirect_uri:, state:)
      cid = client_id
      cfg = config_id
      raise Error, 'App ID da Meta não configurado (INSTAGRAM_APP_ID / INSTAGRAM_UNIFIED_APP_ID).' if cid.blank?
      raise Error, 'Configuration ID do Unified Login ausente (INSTAGRAM_CONFIG_ID).' if cfg.blank?

      query = {
        client_id: cid,
        config_id: cfg,
        redirect_uri: redirect_uri,
        response_type: 'code',
        override_default_response_type: true,
        state: state
      }
      "https://www.facebook.com/dialog/oauth?#{query.to_query}"
    end

    def exchange_code(code:, redirect_uri:)
      cid = client_id
      sec = client_secret
      raise Error, 'Credenciais da Meta ausentes (App ID / App Secret).' if cid.blank? || sec.blank?

      response = HTTParty.get(
        "#{graph_base_uri}/oauth/access_token",
        query: {
          client_id: cid,
          client_secret: sec,
          code: code,
          redirect_uri: redirect_uri
        },
        headers: { 'Accept' => 'application/json' },
        timeout: 30
      )
      data = parse_json(response.body)
      unless response.success? && data['error'].blank? && data['access_token'].present?
        msg = data.dig('error', 'message') || response.body.to_s[0, 300]
        raise Error, "Falha ao trocar código OAuth (Unified Login): #{msg}"
      end

      data
    end

    def fetch_assigned_accounts(access_token:)
      accounts = []

      # Camada 1: endpoint oficial do Instagram API with Unified Login (SUAT)
      after = nil
      20.times do
        query = { fields: 'id,username,name,profile_picture_url', limit: 100 }
        query[:after] = after if after.present?
        response = HTTParty.get(
          "#{graph_base_uri}/me/assigned_instagram_accounts",
          query: query,
          headers: bearer_headers(access_token),
          timeout: 30
        )
        data = parse_json(response.body)
        if response.success? && data['data'].is_a?(Array)
          accounts.concat(data['data'])
          next_after = data.dig('paging', 'cursors', 'after')
          break unless data.dig('paging', 'next').present? && next_after.present?

          after = next_after
        else
          Rails.logger.warn("[PhoneCenter::InstagramUnified] /me/assigned_instagram_accounts: status=#{response.code} body=#{response.body}")
          break
        end
      end

      # Camada 2: fallback caso o usuário autorize via Página vinculada
      if accounts.empty?
        response = HTTParty.get(
          "#{graph_base_uri}/me/accounts",
          query: { fields: 'id,name,instagram_business_account{id,username,name,profile_picture_url}', limit: 100 },
          headers: bearer_headers(access_token),
          timeout: 30
        )
        data = parse_json(response.body)
        if response.success? && data['data'].is_a?(Array)
          data['data'].each do |page|
            ig = page['instagram_business_account']
            accounts << ig if ig.is_a?(Hash) && ig['id'].present?
          end
        end
      end

      # Camada 3: fallback via debug_token (target_ids em granular_scopes)
      if accounts.empty? && client_id.present? && client_secret.present?
        dbg_resp = HTTParty.get(
          "#{graph_base_uri}/debug_token",
          query: {
            input_token: access_token,
            access_token: "#{client_id}|#{client_secret}"
          },
          headers: { 'Accept' => 'application/json' },
          timeout: 20
        )
        dbg_data = parse_json(dbg_resp.body)
        scopes = dbg_data.dig('data', 'granular_scopes')
        if scopes.is_a?(Array)
          target_ids = scopes
                       .select { |s| %w[instagram_basic instagram_manage_messages].include?(s['scope'].to_s) }
                       .flat_map { |s| Array(s['target_ids']) }
                       .map(&:to_s)
                       .reject(&:blank?)
                       .uniq

          target_ids.each do |ig_id|
            acc_resp = HTTParty.get(
              "#{graph_base_uri}/#{ig_id}",
              query: { fields: 'id,username,name,profile_picture_url' },
              headers: bearer_headers(access_token),
              timeout: 20
            )
            acc_data = parse_json(acc_resp.body)
            accounts << acc_data if acc_resp.success? && acc_data['id'].present?
          end
        end
      end

      dedup = {}
      accounts.each do |item|
        next unless item.is_a?(Hash) && item['id'].present?

        dedup[item['id'].to_s] ||= item
      end
      dedup.values
    end

    def subscribe_account(instagram_id:, access_token:)
      return false if instagram_id.blank? || access_token.blank?

      campos_completos = 'messages,message_reactions,messaging_seen,message_edit,comments,live_comments'
      response = HTTParty.post(
        "#{graph_base_uri}/#{instagram_id}/subscribed_apps",
        query: { subscribed_fields: campos_completos },
        headers: bearer_headers(access_token),
        timeout: 25
      )
      data = parse_json(response.body)
      if response.success? && data['success'] == true
        Rails.logger.info("[PhoneCenter::InstagramUnified] Webhook assinado com sucesso para instagram_id=#{instagram_id}")
        return true
      end

      Rails.logger.warn("[PhoneCenter::InstagramUnified] Retry assinatura mínima para instagram_id=#{instagram_id}: #{response.code} #{response.body}")
      retry_resp = HTTParty.post(
        "#{graph_base_uri}/#{instagram_id}/subscribed_apps",
        query: { subscribed_fields: 'messages,message_reactions,messaging_seen' },
        headers: bearer_headers(access_token),
        timeout: 25
      )
      retry_data = parse_json(retry_resp.body)
      if retry_resp.success? && retry_data['success'] == true
        Rails.logger.info("[PhoneCenter::InstagramUnified] Webhook mínimo assinado para instagram_id=#{instagram_id}")
        true
      else
        Rails.logger.error("[PhoneCenter::InstagramUnified] Falha ao assinar webhook instagram_id=#{instagram_id}: #{retry_resp.code} #{retry_resp.body}")
        false
      end
    rescue StandardError => e
      Rails.logger.error("[PhoneCenter::InstagramUnified] Erro ao assinar webhook: #{e.class} #{e.message}")
      false
    end

    def unsubscribe_account(instagram_id:, access_token:)
      return true if instagram_id.blank? || access_token.blank?

      HTTParty.delete(
        "#{graph_base_uri}/#{instagram_id}/subscribed_apps",
        headers: bearer_headers(access_token),
        timeout: 20
      )
      true
    rescue StandardError => e
      Rails.logger.debug { "[PhoneCenter::InstagramUnified] Ignorado erro unsubscribe: #{e.message}" }
      true
    end

    def subscription_status(instagram_id:, access_token:)
      response = HTTParty.get(
        "#{graph_base_uri}/#{instagram_id}/subscribed_apps",
        headers: bearer_headers(access_token),
        timeout: 20
      )
      response.success? ? response.parsed_response : nil
    rescue StandardError => e
      Rails.logger.error("[PhoneCenter::InstagramUnified] Erro subscription_status: #{e.message}")
      nil
    end

    def message_id_aliases(source_id)
      sid = source_id.to_s
      return [sid] if sid.empty?

      decoded = Base64.strict_decode64(sid.gsub(/Z([ABCD])/) { DM_ID_ESCAPES.fetch(Regexp.last_match(1)) })
      match = DM_ID_FORMAT.match(decoded)
      return [sid] unless match && encode_message_id(decoded) == sid

      alt_prefix = match[1] == 'new_ig_dm_item' ? 'ig_dm_item' : 'new_ig_dm_item'
      [sid, encode_message_id(decoded.sub(match[1], alt_prefix))].uniq
    rescue ArgumentError
      [source_id]
    end

    def encode_message_id(value)
      Base64.strict_encode64(value).gsub(%r{[Z/+=]}) { |char| "Z#{DM_ID_ENCODINGS.fetch(char)}" }
    end

    def bearer_headers(token)
      {
        'Accept' => 'application/json',
        'Authorization' => "Bearer #{token}"
      }
    end

    def parse_json(body)
      JSON.parse(body.to_s)
    rescue StandardError
      {}
    end

    def ensure_inbox_members(inbox)
      return if inbox.blank?
      return if inbox.members.exists?

      User.find_each do |user|
        InboxMember.find_or_create_by!(inbox_id: inbox.id, user_id: user.id)
      end
      Rails.logger.info("[PhoneCenter::InstagramUnified] Membros vinculados automaticamente na inbox #{inbox.id} (#{inbox.name})")
    rescue StandardError => e
      Rails.logger.warn("[PhoneCenter::InstagramUnified] Erro ao vincular membros na inbox: #{e.message}")
    end

    def sync_all_channels(max_conversations: 5, max_messages: 5)
      total_synced = 0
      Channel::Instagram.find_each do |channel|
        next unless channel.respond_to?(:unified_login?) && channel.unified_login?
        next if channel.reauthorization_required?

        res = sync_channel_conversations(
          channel,
          max_conversations: max_conversations,
          max_messages: max_messages
        )
        total_synced += res[:synced].to_i
      end
      total_synced
    end

    def sync_channel_conversations(channel, max_conversations: 5, max_messages: 5, days_back: 14)
      return { synced: 0, skipped: 'invalid_channel' } unless channel.respond_to?(:unified_login?) && channel.unified_login?
      return { synced: 0, skipped: 'no_inbox' } if channel.inbox.blank?

      ensure_inbox_members(channel.inbox)

      cooldown_key = "pc:ig_sync_cooldown:#{channel.id}"
      if redis_get(cooldown_key).present?
        return { synced: 0, skipped: 'rate_limit_cooldown' }
      end

      response = HTTParty.get(
        "#{channel.base_uri}/#{channel.instagram_id}/conversations",
        query: {
          platform: 'instagram',
          fields: "id,updated_time,participants,messages.limit(#{max_messages}){id,message,from,created_time,attachments{id,mime_type,image_data,video_data,file_url}}",
          limit: max_conversations
        },
        headers: bearer_headers(channel.access_token),
        timeout: 25
      )
      data = parse_json(response.body)

      unless response.success? && data['error'].blank?
        err_code = data.dig('error', 'code').to_i
        err_msg = data.dig('error', 'message') || response.body.to_s[0, 200]
        if [4, 17, 32, 613].include?(err_code) || response.code == 429
          redis_set(cooldown_key, '1', ex: 300)
          Rails.logger.warn("[PhoneCenter::InstagramUnified] Rate limit no sync (#{err_code}), pausa de 5 min: #{err_msg}")
        else
          Rails.logger.warn("[PhoneCenter::InstagramUnified] Falha no sync ig_id=#{channel.instagram_id}: #{response.code} #{err_msg}")
        end
        return { synced: 0, error: err_msg }
      end

      cutoff = days_back.days.ago
      synced = 0

      Array(data['data']).each do |conv|
        updated_at = parse_meta_time(conv['updated_time'])
        next if updated_at && updated_at < cutoff

        participants = Array(conv.dig('participants', 'data'))
        other = participants.find { |p| p['id'].to_s != channel.instagram_id.to_s }
        next if other.blank? || other['id'].blank?

        other_id = other['id'].to_s
        other_username = other['username'].to_s.strip

        messages = Array(conv.dig('messages', 'data')).reverse
        messages.each do |msg|
          mid = msg['id'].to_s
          next if mid.blank?
          next if channel.find_message_by_source_id(mid).present?

          text = msg['message'].to_s
          mapped_attachments = map_graph_attachments(msg.dig('attachments', 'data'))
          next if text.blank? && mapped_attachments.empty?

          from_id = msg.dig('from', 'id').to_s
          next if from_id.blank?

          is_echo = (from_id == channel.instagram_id.to_s)
          msg_time = parse_meta_time(msg['created_time']) || Time.current

          msg_hash = {
            mid: mid,
            text: text.presence,
            is_echo: is_echo ? true : nil
          }.compact
          msg_hash[:attachments] = mapped_attachments if mapped_attachments.any?

          messaging = {
            sender: { id: is_echo ? channel.instagram_id.to_s : from_id },
            recipient: { id: is_echo ? other_id : channel.instagram_id.to_s },
            timestamp: msg_time.to_i * 1000,
            message: msg_hash
          }.with_indifferent_access

          begin
            ::Instagram::MessageText.new(messaging, channel).perform
            created_msg = channel.find_message_by_source_id(mid)
            if created_msg.present?
              synced += 1
              created_msg.update_column(:created_at, msg_time) if msg_time < 2.minutes.ago
              enrich_synced_contact(created_msg.conversation&.contact, other_id, other_username)
            end
          rescue StandardError => e
            Rails.logger.warn("[PhoneCenter::InstagramUnified] Erro ao importar msg #{mid}: #{e.class} #{e.message}")
          end
        end
      end

      Rails.logger.info("[PhoneCenter::InstagramUnified] Sync concluído ig_id=#{channel.instagram_id}: #{synced} nova(s) mensagem(ns)") if synced.positive?
      { synced: synced }
    rescue StandardError => e
      Rails.logger.error("[PhoneCenter::InstagramUnified] Erro inesperado no sync: #{e.class} #{e.message}")
      { synced: 0, error: e.message }
    end

    def map_graph_attachments(raw_attachments)
      Array(raw_attachments).filter_map do |att|
        next unless att.is_a?(Hash)

        if att.dig('image_data', 'url').present?
          { type: 'image', payload: { url: att.dig('image_data', 'url') } }
        elsif att.dig('video_data', 'url').present?
          { type: 'video', payload: { url: att.dig('video_data', 'url') } }
        elsif att['file_url'].present?
          kind = att['mime_type'].to_s.start_with?('audio') ? 'audio' : 'file'
          { type: kind, payload: { url: att['file_url'] } }
        end
      end
    end

    def enrich_synced_contact(contact, other_id, other_username)
      return if contact.blank? || other_username.blank?

      attrs = contact.additional_attributes.is_a?(Hash) ? contact.additional_attributes.dup : {}
      changed = false

      if contact.name.blank? || contact.name.to_s == other_id || contact.name.to_s.start_with?('Instagram')
        contact.name = other_username
        changed = true
      end

      unless attrs['social_instagram_user_name'].present?
        attrs['social_instagram_user_name'] = other_username
        attrs['social_profiles'] = (attrs['social_profiles'].is_a?(Hash) ? attrs['social_profiles'] : {}).merge('instagram' => other_username)
        contact.additional_attributes = attrs
        changed = true
      end

      contact.save if changed
    rescue StandardError
      nil
    end

    def parse_meta_time(value)
      return nil if value.blank?

      Time.parse(value.to_s)
    rescue StandardError
      nil
    end

    def redis_get(key)
      return nil unless defined?(Sidekiq)

      Sidekiq.redis { |r| r.get(key) }
    rescue StandardError
      nil
    end

    def redis_set(key, value, ex: 60, nx: false)
      return true unless defined?(Sidekiq)

      Sidekiq.redis do |r|
        if nx
          res = r.set(key, value, nx: true, ex: ex)
          res == true || res == 'OK'
        else
          r.set(key, value, ex: ex)
          true
        end
      end
    rescue StandardError
      true
    end

    def redis_del(key)
      return nil unless defined?(Sidekiq)

      Sidekiq.redis { |r| r.respond_to?(:del) ? r.del(key) : r.call('DEL', key) }
    rescue StandardError
      nil
    end

    def active_chat?
      redis_get('pc:ig_active_chat').present?
    end

    def warm_chat?
      redis_get('pc:ig_warm_chat').present?
    end

    def mark_active_chat!(boost_sync: false)
      redis_set('pc:ig_active_chat', '1', ex: 90)
      redis_set('pc:ig_warm_chat', '1', ex: 240)
      return unless boost_sync && defined?(PhoneCenter::InstagramUnifiedSyncJob)

      if redis_set('pc:ig_boost_scheduled', '1', ex: 6, nx: true)
        redis_del('pc:ig_sync_next_scheduled')
        PhoneCenter::InstagramUnifiedSyncJob.set(wait: 4.seconds).perform_later('poll')
      end
    rescue StandardError
      nil
    end
  end

  module InstagramPatches
    module ChannelPatch
      def unified_login?
        evolution_hub_meta.is_a?(Hash) && evolution_hub_meta['auth_type'] == 'unified_login'
      end

      def base_uri
        if unified_login?
          PhoneCenter::InstagramUnified.graph_base_uri
        else
          "https://graph.instagram.com/#{GlobalConfigService.load('INSTAGRAM_API_VERSION', 'v23.0')}"
        end
      end

      def access_token
        return self[:access_token] if unified_login?

        super
      end

      def subscribe
        if unified_login? && !MetaBaseUrl.enabled?
          return PhoneCenter::InstagramUnified.subscribe_account(
            instagram_id: instagram_id,
            access_token: access_token
          )
        end

        super
      end

      def unsubscribe
        if unified_login? && !MetaBaseUrl.enabled?
          return PhoneCenter::InstagramUnified.unsubscribe_account(
            instagram_id: instagram_id,
            access_token: self[:access_token]
          )
        end

        super
      end

      def subscription_status
        if unified_login? && !MetaBaseUrl.enabled?
          return PhoneCenter::InstagramUnified.subscription_status(
            instagram_id: instagram_id,
            access_token: access_token
          )
        end

        super
      end

      def find_message_by_source_id(source_id)
        return nil if source_id.blank? || inbox.blank?

        ids = unified_login? ? PhoneCenter::InstagramUnified.message_id_aliases(source_id) : source_id
        inbox.messages.find_by(source_id: ids)
      end
    end

    module IntegrationHelperPatch
      def token_payload(identifier)
        {
          sub: identifier,
          iat: Time.current.to_i,
          exp: 15.minutes.from_now.to_i
        }
      end

      private

      def client_secret
        return PhoneCenter::InstagramUnified.client_secret if PhoneCenter::InstagramUnified.enabled?

        super
      end
    end

    module AuthorizationsControllerPatch
      def create
        return super unless PhoneCenter::InstagramUnified.enabled?

        state = generate_instagram_token('community')
        if state.blank?
          render json: {
            success: false,
            error: 'Segredo do App Meta ausente (INSTAGRAM_APP_SECRET / INSTAGRAM_UNIFIED_APP_SECRET).'
          }, status: :unprocessable_entity
          return
        end

        url = PhoneCenter::InstagramUnified.authorization_url(
          redirect_uri: "#{base_url}/instagram/callback",
          state: state
        )
        render json: { success: true, url: url }
      rescue StandardError => e
        Rails.logger.error("[PhoneCenter::InstagramUnified] create error: #{e.class} #{e.message}")
        render json: { success: false, error: e.message }, status: :unprocessable_entity
      end

      def callback
        return super unless PhoneCenter::InstagramUnified.enabled?

        code = params[:code]
        state = params[:state]

        unless code.present? && state.present?
          render json: { success: false, error: 'Missing code or state' }, status: :bad_request
          return
        end

        identifier = verify_instagram_token(state)
        unless identifier.present?
          render json: { success: false, error: 'Invalid or expired state token' }, status: :unauthorized
          return
        end

        token_data = PhoneCenter::InstagramUnified.exchange_code(
          code: code,
          redirect_uri: "#{base_url}/instagram/callback"
        )
        access_token = token_data.fetch('access_token')
        accounts = PhoneCenter::InstagramUnified.fetch_assigned_accounts(access_token: access_token)

        if accounts.empty?
          render json: {
            success: false,
            error: 'Nenhuma conta Profissional do Instagram foi retornada pela Meta. Verifique se a conta é Profissional/Comercial, se você concedeu acesso a ela na tela de login e (em modo desenvolvimento) se aceitou o convite de Testador do Instagram.'
          }, status: :unprocessable_entity
          return
        end

        expires_in = token_data['expires_in'].to_i
        expires_at = expires_in.positive? ? Time.current + expires_in.seconds : 10.years.from_now
        cfg_id = PhoneCenter::InstagramUnified.config_id

        channels = accounts.map do |acc|
          upsert_unified_channel(
            acc: acc,
            access_token: access_token,
            expires_at: expires_at,
            cfg_id: cfg_id
          )
        end

        primary = channels.first
        render json: {
          success: true,
          inbox_id: primary.inbox&.id,
          channel_id: primary.id,
          connected_accounts: channels.size
        }
      rescue StandardError => e
        Rails.logger.error("[PhoneCenter::InstagramUnified] callback error: #{e.class} #{e.message}")
        Rails.logger.error(e.backtrace.first(10).join("\n")) if e.backtrace
        render json: { success: false, error: e.message }, status: :unprocessable_entity
      end

      private

      def token_payload(identifier)
        return super unless PhoneCenter::InstagramUnified.enabled?

        {
          sub: identifier,
          iat: Time.current.to_i,
          exp: 15.minutes.from_now.to_i
        }
      end

      def client_secret
        return PhoneCenter::InstagramUnified.client_secret if PhoneCenter::InstagramUnified.enabled?

        super
      end

      def upsert_unified_channel(acc:, access_token:, expires_at:, cfg_id:)
        ig_id = acc['id'].to_s
        username = acc['username'].presence || acc['name'].presence || "instagram_#{ig_id}"
        channel_instagram = Channel::Instagram.find_by(instagram_id: ig_id)

        meta_atual = channel_instagram&.evolution_hub_meta.is_a?(Hash) ? channel_instagram.evolution_hub_meta : {}
        # Nunca gravar 'status' em evolution_hub_meta para não ativar hub_managed?
        novo_meta = meta_atual.except('status').merge(
          'auth_type' => 'unified_login',
          'configuration_id' => cfg_id.to_s,
          'provider_name' => username,
          'connected_at' => Time.current.iso8601
        )

        if channel_instagram
          Rails.logger.info("[PhoneCenter::InstagramUnified] Atualizando canal existente instagram_id=#{ig_id} (@#{username})")
          channel_instagram.update!(
            access_token: access_token,
            expires_at: expires_at,
            evolution_hub_meta: novo_meta
          )
          if channel_instagram.inbox
            channel_instagram.inbox.update!(name: username)
          else
            Inbox.create!(channel: channel_instagram, name: username)
          end
          channel_instagram.subscribe unless channel_instagram.saved_change_to_access_token?
        else
          Rails.logger.info("[PhoneCenter::InstagramUnified] Criando novo canal instagram_id=#{ig_id} (@#{username})")
          ActiveRecord::Base.transaction do
            channel_instagram = Channel::Instagram.create!(
              access_token: access_token,
              instagram_id: ig_id,
              expires_at: expires_at,
              evolution_hub_meta: novo_meta
            )
            Inbox.create!(
              channel: channel_instagram,
              name: username
            )
          end
        end

        channel_instagram.reauthorized!
        PhoneCenter::InstagramUnified.ensure_inbox_members(channel_instagram.inbox)
        if defined?(PhoneCenter::InstagramUnifiedSyncJob)
          PhoneCenter::InstagramUnifiedSyncJob.perform_later('initial')
        end
        channel_instagram
      end
    end

    module SendOnInstagramServicePatch
      private

      def send_message(message_content)
        if channel.respond_to?(:unified_login?) && channel.unified_login? && !MetaBaseUrl.enabled?
          access_token = channel.access_token
          instagram_id = channel.instagram_id.presence || 'me'
          endpoint = "#{channel.base_uri}/#{instagram_id}/messages"
          response = HTTParty.post(
            endpoint,
            body: message_content,
            query: { access_token: access_token }
          )

          parsed = response.parsed_response
          tag_val = message_content.is_a?(Hash) ? (message_content[:tag] || message_content['tag']) : nil
          if !response.success? && parsed.is_a?(Hash) && parsed.dig('error', 'code').to_i == 10 && tag_val == 'HUMAN_AGENT'
            Rails.logger.warn('[PhoneCenter::InstagramUnified] Human Agent não aprovado (erro #10) — reenviando dentro da janela padrão de 24h sem tag HUMAN_AGENT')
            clean_payload = message_content.reject { |k, _| %w[messaging_type tag].include?(k.to_s) }
            response = HTTParty.post(
              endpoint,
              body: clean_payload,
              query: { access_token: access_token }
            )
            PhoneCenter::InstagramUnified.mark_active_chat!(boost_sync: true) if response.success?
            return process_response(response, clean_payload)
          end

          PhoneCenter::InstagramUnified.mark_active_chat!(boost_sync: true) if response.success?
          return process_response(response, message_content)
        end

        super
      end
    end

    module MessageTextPatch
      def base_uri
        return @inbox.channel.base_uri if @inbox&.channel&.respond_to?(:unified_login?) && @inbox.channel.unified_login?

        super
      end

      private

      def unsend_message
        return super unless @inbox&.channel&.respond_to?(:unified_login?) && @inbox.channel.unified_login?

        message_to_delete = @inbox.channel.find_message_by_source_id(@messaging.dig(:message, :mid))
        return if message_to_delete.blank?

        message_to_delete.attachments.destroy_all
        message_to_delete.update!(content: I18n.t('conversations.messages.deleted'), deleted: true)
      end
    end

    module MessageBuilderPatch
      private

      def base_uri
        return @inbox.channel.base_uri if @inbox&.channel&.respond_to?(:unified_login?) && @inbox.channel.unified_login?

        super
      end

      def find_message_by_source_id(source_id)
        return super unless @inbox&.channel&.respond_to?(:unified_login?) && @inbox.channel.unified_login?

        @message = @inbox.channel.find_message_by_source_id(source_id)
      end

      def message_reply_attributes
        source_id = super
        return source_id if source_id.blank?
        return source_id unless @inbox&.channel&.respond_to?(:unified_login?) && @inbox.channel.unified_login?

        @inbox.channel.find_message_by_source_id(source_id)&.source_id || source_id
      end
    end

    module ReadStatusServicePatch
      def message
        return super unless @channel&.respond_to?(:unified_login?) && @channel.unified_login?
        return nil unless params.dig(:read, :mid)

        @message ||= @channel.find_message_by_source_id(params[:read][:mid])
      end
    end

    module RefreshOauthTokenServicePatch
      def access_token
        return channel[:access_token] if channel.respond_to?(:unified_login?) && channel.unified_login?

        super
      end
    end
  end
end

Rails.application.config.to_prepare do
  targets = [
    [Channel::Instagram, PhoneCenter::InstagramPatches::ChannelPatch],
    [Instagram::IntegrationHelper, PhoneCenter::InstagramPatches::IntegrationHelperPatch],
    [Api::V1::Instagram::AuthorizationsController, PhoneCenter::InstagramPatches::AuthorizationsControllerPatch],
    [Instagram::SendOnInstagramService, PhoneCenter::InstagramPatches::SendOnInstagramServicePatch],
    [Instagram::MessageText, PhoneCenter::InstagramPatches::MessageTextPatch],
    [Messages::Instagram::MessageBuilder, PhoneCenter::InstagramPatches::MessageBuilderPatch],
    [Instagram::ReadStatusService, PhoneCenter::InstagramPatches::ReadStatusServicePatch],
    [Instagram::RefreshOauthTokenService, PhoneCenter::InstagramPatches::RefreshOauthTokenServicePatch]
  ]

  targets.each do |klass, patch_mod|
    klass.prepend(patch_mod) unless klass.ancestors.include?(patch_mod)
  end

  unless Channel::Instagram.validators_on(:access_token).any? { |v| v.kind == :length }
    Channel::Instagram.validates :access_token, length: { maximum: 4096 }, allow_blank: true
  end

  unless defined?(PhoneCenter::InstagramUnifiedSyncJob)
    class PhoneCenter::InstagramUnifiedSyncJob < ApplicationJob
      queue_as :scheduled_jobs

      def perform(mode = 'watchdog')
        mode_str = mode.to_s
        is_initial = (mode_str == 'initial')
        is_watchdog = (mode_str == 'watchdog' || mode == true)

        if is_watchdog && PhoneCenter::InstagramUnified.redis_get('pc:ig_sync_next_scheduled').present?
          return
        end

        acquired = PhoneCenter::InstagramUnified.redis_set('pc:ig_sync_lock', '1', ex: 45, nx: true)
        return unless acquired

        begin
          has_active = Channel::Instagram.all.any? do |c|
            c.respond_to?(:unified_login?) && c.unified_login? && !c.reauthorization_required?
          end
          return unless has_active

          last_run = PhoneCenter::InstagramUnified.redis_get('pc:ig_sync_last_run').to_i
          if is_initial || (Time.now.to_i - last_run) >= 4
            synced = if is_initial
                       PhoneCenter::InstagramUnified.sync_all_channels(max_conversations: 10, max_messages: 10)
                     else
                       PhoneCenter::InstagramUnified.sync_all_channels(max_conversations: 5, max_messages: 5)
                     end
            PhoneCenter::InstagramUnified.redis_set('pc:ig_sync_last_run', Time.now.to_i.to_s, ex: 120)
            PhoneCenter::InstagramUnified.mark_active_chat!(boost_sync: false) if synced.to_i.positive?
          end

          next_interval = if PhoneCenter::InstagramUnified.active_chat?
                            5
                          elsif PhoneCenter::InstagramUnified.warm_chat?
                            15
                          else
                            45
                          end
          if PhoneCenter::InstagramUnified.redis_set('pc:ig_sync_next_scheduled', '1', ex: [next_interval - 1, 3].max, nx: true)
            PhoneCenter::InstagramUnifiedSyncJob.set(wait: next_interval.seconds).perform_later('poll')
          end
        ensure
          PhoneCenter::InstagramUnified.redis_del('pc:ig_sync_lock')
        end
      end
    end
  end

  if defined?(Sidekiq::Cron::Job) && defined?(Sidekiq) && Sidekiq.server?
    Sidekiq::Cron::Job.create(
      name: 'phonecenter_instagram_unified_sync',
      cron: '* * * * *',
      class: 'PhoneCenter::InstagramUnifiedSyncJob',
      queue: 'scheduled_jobs',
      description: 'Sincronização híbrida de DMs Instagram Unified Login (fallback + histórico recente)'
    )
  end
end
